import {
  N8nClient,
  CheckAvailabilityInput,
  CheckAvailabilityOutput,
  FindAlternativeTimesInput,
  FindAlternativeTimesOutput,
  CreateAppointmentInput,
  CreateAppointmentOutput,
  LookupAppointmentInput,
  LookupAppointmentOutput,
  RescheduleAppointmentInput,
  RescheduleAppointmentOutput,
  CancelAppointmentInput,
  CancelAppointmentOutput,
  AppointmentRecord,
  AvailabilitySlot,
  AlternativeSlot,
} from './N8nClient';
import { PersonaRegistry } from '../../personas/PersonaRegistry';
import { PersonaBusinessTruth } from '../../personas/PersonaBusinessTruth';
import { resolveDate, resolveTime, weekdayOf, addDays, speakDate, speakTime } from '../../core/time/DateResolver';
import { getHolidayName } from '../../core/time/FederalHolidays';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function mins(hhmm: string): number {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function toHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export class MockN8nClient implements N8nClient {
  private static instance: MockN8nClient | null = null;
  private appointments: Map<string, AppointmentRecord> = new Map();
  private requestIndex: Map<string, string> = new Map(); // requestId -> confirmationCode

  public static getInstance(): MockN8nClient {
    if (!this.instance) {
      this.instance = new MockN8nClient();
    }
    return this.instance;
  }

  public clear(): void {
    this.appointments.clear();
    this.requestIndex.clear();
  }

  /**
   * Generates a 6+ character random alphanumeric confirmation code scoped to persona prefix
   * with collision checks against existing bookings.
   */
  private generateConfirmationCode(personaId: string): string {
    const prefix = personaId.split('-')[0].slice(0, 3).toUpperCase();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      let rand = '';
      for (let i = 0; i < 6; i++) {
        rand += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      code = `${prefix}-${rand}`;
    } while (this.appointments.has(code));
    return code;
  }

  public async checkAvailability(input: CheckAvailabilityInput): Promise<CheckAvailabilityOutput> {
    const persona = PersonaRegistry.get(input.personaId);
    const tz = persona.business?.timezone || 'America/New_York';

    // 1. Resolve date
    const dateRes = resolveDate(input.date, {
      timezone: tz,
      nextWeekdayPolicy: input.nextWeekdayPolicy ?? 'ask',
    });

    if (dateRes.confidence === 'ambiguous' || dateRes.needsConfirmation) {
      return {
        available: false,
        slots: [],
        reason: dateRes.reason || 'Date is ambiguous',
        needsConfirmation: true,
        candidates: dateRes.candidates,
      };
    }

    const resolvedDateStr = dateRes.date || input.date;
    const weekdayIdx = weekdayOf(resolvedDateStr);
    const weekdayKey = WEEKDAYS[weekdayIdx];

    // Check holiday
    const year = Number(resolvedDateStr.slice(0, 4));
    const holiday = getHolidayName(resolvedDateStr, year, persona.hours?.holidays ?? []);
    if (holiday) {
      return {
        available: false,
        slots: [],
        date: resolvedDateStr,
        weekday: dateRes.weekday,
        reason: `Closed on ${holiday}`,
      };
    }

    // Check hours for the target day
    const schedule = persona.hours?.schedule ?? {};
    const dayEntry = schedule[weekdayKey];
    const emergencyHours = persona.hours?.emergencyHours;
    const isEmergencyService = Boolean(
      input.serviceId && emergencyHours?.serviceIds?.includes(input.serviceId)
    );

    if ((!dayEntry || dayEntry.closed || !dayEntry.intervals || dayEntry.intervals.length === 0) && !isEmergencyService) {
      return {
        available: false,
        slots: [],
        date: resolvedDateStr,
        weekday: dateRes.weekday,
        reason: `Closed on ${dateRes.weekday ?? weekdayKey}`,
      };
    }

    // Determine target service and duration
    const service = persona.services.find((s) => s.id === input.serviceId) || persona.services[0];
    const duration = service ? service.durationMinutes : 60;

    // Find applicable resources
    let targetResources = persona.resources.filter((r) =>
      service ? r.serviceIds.includes(service.id) : true
    );
    if (input.resourceId) {
      targetResources = targetResources.filter((r) => r.id === input.resourceId);
    }

    if (targetResources.length === 0) {
      return {
        available: false,
        slots: [],
        date: resolvedDateStr,
        weekday: dateRes.weekday,
        reason: 'No capable resource available for this service.',
      };
    }

    // Resolve time context with open/close hours
    const firstInterval = dayEntry?.intervals?.[0] || { open: '09:00', close: '17:00' };
    const timeRes = input.time
      ? resolveTime(input.time, { openClose: firstInterval })
      : undefined;

    const requestedStartMins = timeRes?.time ? mins(timeRes.time) : undefined;
    const windowStartMins = input.window ? mins(input.window.start) : undefined;
    const windowEndMins = input.window ? mins(input.window.end) : undefined;
    const partySize = input.partySize ?? 1;

    const openIntervals = dayEntry?.intervals || [];
    const availableSlots: AvailabilitySlot[] = [];

    for (const res of targetResources) {
      const resCapacity = res.capacity ?? 1;

      for (const interval of openIntervals) {
        const openM = mins(interval.open);
        const closeM = PersonaBusinessTruth.toMinutes(interval.close, true);

        // Generate candidate start times in 30-min increments
        for (let startM = openM; startM + duration <= closeM; startM += 30) {
          const endM = startM + duration;
          const startHHMM = toHHMM(startM);
          const endHHMM = toHHMM(endM);

          // If specific time was requested, match within 15 minutes
          if (requestedStartMins !== undefined) {
            if (Math.abs(startM - requestedStartMins) > 15) {
              continue;
            }
          }

          // If time window was requested, filter by window
          if (windowStartMins !== undefined && windowEndMins !== undefined) {
            if (startM < windowStartMins || startM >= windowEndMins) {
              continue;
            }
          }

          // Check SeededBusy for this resource on this weekday
          let isSeededBusy = false;
          for (const busy of persona.seededBusy ?? []) {
            if (busy.resourceId === res.id && busy.days.includes(weekdayKey)) {
              const bStart = mins(busy.start);
              const bEnd = mins(busy.end);
              // Check overlap
              if (Math.max(startM, bStart) < Math.min(endM, bEnd)) {
                if (resCapacity > 1) {
                  const taken = busy.seatsTaken ?? resCapacity;
                  if (taken + partySize > resCapacity) {
                    isSeededBusy = true;
                    break;
                  }
                } else {
                  isSeededBusy = true;
                  break;
                }
              }
            }
          }

          if (isSeededBusy) continue;

          // Check existing bookings in mock store
          let isBooked = false;
          let seatsTaken = 0;

          for (const apt of this.appointments.values()) {
            if (
              apt.personaId === input.personaId &&
              apt.resourceId === res.id &&
              apt.date === resolvedDateStr &&
              apt.status === 'CONFIRMED'
            ) {
              const aStart = mins(apt.start);
              const aEnd = mins(apt.end);
              if (Math.max(startM, aStart) < Math.min(endM, aEnd)) {
                if (resCapacity > 1) {
                  seatsTaken += apt.partySize ?? 1;
                } else {
                  isBooked = true;
                  break;
                }
              }
            }
          }

          if (isBooked || (resCapacity > 1 && seatsTaken + partySize > resCapacity)) {
            continue;
          }

          availableSlots.push({
            start: startHHMM,
            end: endHHMM,
            resourceId: res.id,
            resourceName: res.name,
          });
        }
      }
    }

    return {
      available: availableSlots.length > 0,
      slots: availableSlots.slice(0, 8),
      date: resolvedDateStr,
      weekday: dateRes.weekday,
      reason: availableSlots.length === 0 ? 'No available slots matching criteria.' : undefined,
    };
  }

  public async findAlternativeTimes(input: FindAlternativeTimesInput): Promise<FindAlternativeTimesOutput> {
    const alternatives: AlternativeSlot[] = [];
    const baseDate = input.date;

    for (let dayOffset = 0; dayOffset <= 5; dayOffset++) {
      const checkDate = addDays(baseDate, dayOffset);
      const avail = await this.checkAvailability({
        ...input,
        date: checkDate,
        time: undefined, // search all open slots on this date
      });

      if (avail.available && avail.slots.length > 0) {
        for (const s of avail.slots.slice(0, 2)) {
          alternatives.push({
            date: checkDate,
            start: s.start,
            end: s.end,
            resourceId: s.resourceId,
            resourceName: s.resourceName,
          });
          if (alternatives.length >= 4) break;
        }
      }

      if (alternatives.length >= 4) break;
    }

    return {
      alternatives,
      reason: alternatives.length === 0 ? 'No alternative openings found over the next 5 days.' : undefined,
    };
  }

  public async createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentOutput> {
    // 1. Idempotency Check
    if (input.requestId && this.requestIndex.has(input.requestId)) {
      const code = this.requestIndex.get(input.requestId)!;
      const existing = this.appointments.get(code);
      if (existing) {
        return {
          success: true,
          confirmationCode: existing.confirmationCode,
          appointment: existing,
          emailStatus: 'not_configured',
        };
      }
    }

    const persona = PersonaRegistry.get(input.personaId);
    const service = persona.services.find((s) => s.id === input.serviceId) || persona.services[0];
    if (!service) {
      return {
        success: false,
        errorCode: 'INVALID_SERVICE',
        message: `Service "${input.serviceId}" not found for ${persona.identity.businessName}.`,
      };
    }

    // 2. Validate availability
    const avail = await this.checkAvailability({
      personaId: input.personaId,
      serviceId: service.id,
      date: input.date,
      time: input.start,
      partySize: input.partySize,
      resourceId: input.resourceId,
    });

    if (!avail.available || avail.slots.length === 0) {
      return {
        success: false,
        errorCode: 'SLOT_UNAVAILABLE',
        message: `The time slot ${input.start} on ${input.date} is no longer available.`,
      };
    }

    const matchedSlot = avail.slots[0];
    const resource = persona.resources.find((r) => r.id === matchedSlot.resourceId) || persona.resources[0];

    const confirmationCode = this.generateConfirmationCode(input.personaId);
    const record: AppointmentRecord = {
      id: `apt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      confirmationCode,
      personaId: input.personaId,
      sessionId: input.sessionId,
      requestId: input.requestId,
      serviceId: service.id,
      serviceName: service.name,
      date: avail.date || input.date,
      start: matchedSlot.start,
      end: matchedSlot.end,
      resourceId: resource.id,
      resourceName: resource.name,
      customerName: input.customerName,
      email: input.email,
      phone: input.phone,
      partySize: input.partySize,
      vehicleInfo: input.vehicleInfo,
      notes: input.notes,
      status: 'CONFIRMED',
      createdAt: Date.now(),
    };

    this.appointments.set(confirmationCode.toUpperCase(), record);
    if (input.requestId) {
      this.requestIndex.set(input.requestId, confirmationCode.toUpperCase());
    }

    return {
      success: true,
      confirmationCode,
      appointment: record,
      emailStatus: 'not_configured',
    };
  }

  public async lookupAppointment(input: LookupAppointmentInput): Promise<LookupAppointmentOutput> {
    if (input.confirmationCode) {
      const code = input.confirmationCode.trim().toUpperCase();
      const apt = this.appointments.get(code);
      if (apt && apt.personaId === input.personaId && apt.status === 'CONFIRMED') {
        return { found: true, appointment: apt };
      }
    }

    // Fallback: search by sessionId for appointments created in this current call session
    if (input.sessionId) {
      for (const apt of this.appointments.values()) {
        if (
          apt.sessionId === input.sessionId &&
          apt.personaId === input.personaId &&
          apt.status === 'CONFIRMED'
        ) {
          return { found: true, appointment: apt };
        }
      }
    }

    return {
      found: false,
      message: 'No active appointment found with the provided confirmation code.',
    };
  }

  public async rescheduleAppointment(input: RescheduleAppointmentInput): Promise<RescheduleAppointmentOutput> {
    const code = input.confirmationCode.trim().toUpperCase();
    const apt = this.appointments.get(code);

    if (!apt || apt.personaId !== input.personaId || apt.status !== 'CONFIRMED') {
      return {
        success: false,
        errorCode: 'APPOINTMENT_NOT_FOUND',
        message: `Could not find an active appointment with confirmation code "${input.confirmationCode}".`,
      };
    }

    // Check availability on new date / time
    const avail = await this.checkAvailability({
      personaId: input.personaId,
      serviceId: apt.serviceId,
      date: input.newDate,
      time: input.newStart,
      partySize: apt.partySize,
      resourceId: input.resourceId,
    });

    if (!avail.available || avail.slots.length === 0) {
      return {
        success: false,
        errorCode: 'NEW_SLOT_UNAVAILABLE',
        message: `The new time slot ${input.newStart} on ${input.newDate} is not available.`,
      };
    }

    const matchedSlot = avail.slots[0];
    apt.date = avail.date || input.newDate;
    apt.start = matchedSlot.start;
    apt.end = matchedSlot.end;
    apt.resourceId = matchedSlot.resourceId;
    apt.resourceName = matchedSlot.resourceName;

    return {
      success: true,
      confirmationCode: apt.confirmationCode,
      appointment: apt,
      emailStatus: 'not_configured',
    };
  }

  public async cancelAppointment(input: CancelAppointmentInput): Promise<CancelAppointmentOutput> {
    if (!input.confirmed) {
      return {
        success: false,
        errorCode: 'CONFIRMATION_REQUIRED',
        message: 'Cancellation requires explicit caller confirmation.',
      };
    }

    const code = input.confirmationCode.trim().toUpperCase();
    const apt = this.appointments.get(code);

    if (!apt || apt.personaId !== input.personaId) {
      return {
        success: false,
        errorCode: 'APPOINTMENT_NOT_FOUND',
        message: `No appointment found with confirmation code "${input.confirmationCode}".`,
      };
    }

    apt.status = 'CANCELLED';
    return {
      success: true,
      confirmationCode: apt.confirmationCode,
      emailStatus: 'not_configured',
      message: `Appointment ${apt.confirmationCode} has been successfully cancelled.`,
    };
  }
}
