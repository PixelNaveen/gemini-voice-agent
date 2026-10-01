import {
  CreateAppointmentRequestDto,
  AppointmentResponseDto,
  AvailabilityQueryDto,
  AvailabilityResponseDto,
} from '../../api/dto/AppointmentDtos';
import { CalendarAdapter } from '../../integrations/calendar/CalendarAdapter';
import { BookingService as LiveBookingService } from '../../tools/booking/BookingService';
import { ToolExecutionContext } from '../../tools/ToolTypes';

/**
 * DTO-shaped facade over the one authoritative booking path.
 *
 * This file used to be a second, independent booking implementation. It was worse than a
 * duplicate: it was a *weaker* one. It hardcoded a persona, bypassed `BookingValidator`
 * (so business hours and advance-notice policy were not enforced), kept its own idempotency
 * ledger in the process-local `ToolOperationRepository`, and wrote to a separate in-memory
 * `AppointmentRepository` that the live system never reads. A caller reaching it got a
 * `CONFIRMED` appointment recorded somewhere the rest of the system cannot see, with none of
 * the guarantees the live path gives. It was exported, so it was reachable.
 *
 * The earlier audit left it in place because the two services disagree about what a booking
 * is, and folding it in would have changed what the existing tests assert. That reasoning
 * chose the wrong trade: a test asserting the behaviour of a second authority is not a reason
 * to keep the second authority. The duplication is removed by delegation instead, so there is
 * nothing left to disagree.
 *
 * The DTOs are preserved because they are the transport shape this facade is called with, and
 * `tenantId` is the DTO's name for what the live path calls `personaId`.
 */
export class BookingService {
  public static async checkAvailability(query: AvailabilityQueryDto): Promise<AvailabilityResponseDto> {
    // Previously `query.serviceId || 'aura-salon'` was used as the *persona*, and
    // `query.serviceId || 'Haircut'` as the service - so a caller who supplied a service id
    // was booking against a salon persona, and a caller who did not was asking about a haircut
    // regardless of which persona they were calling. The persona now comes from the tenant the
    // caller actually named, and a missing service is a real gap rather than a guess.
    if (!query.tenantId) {
      throw new Error('Availability requires a tenantId; guessing a persona would book the wrong business.');
    }
    if (!query.serviceId) {
      throw new Error('Availability requires a serviceId; the previous default asked about a haircut for every persona.');
    }

    const slots = CalendarAdapter.checkAvailability(query.tenantId, query.date, query.serviceId);
    return {
      tenantId: query.tenantId,
      date: query.date,
      availableSlots: slots.map((s) => s.startTime),
      timezone: 'UTC',
      retrievedAt: Date.now(),
    };
  }

  public static async createAppointment(dto: CreateAppointmentRequestDto): Promise<AppointmentResponseDto> {
    if (!dto.tenantId) {
      throw new Error('A booking requires a tenantId; a hardcoded persona would book the wrong business.');
    }

    const context: ToolExecutionContext = {
      sessionId: dto.sessionId,
      personaId: dto.tenantId,
      operationId: dto.idempotencyKey ?? `dto_${dto.sessionId}_${dto.date}_${dto.time}`,
      idempotencyKey: dto.idempotencyKey,
      timestamp: Date.now(),
      toolName: 'createAppointment',
    };

    // The live path owns validation, the durable idempotency ledger, reconciliation of
    // interrupted operations, and the authoritative store. This facade adds no policy of its
    // own, which is the entire point: there is now one place where a booking can be created,
    // and it is the one that enforces the guarantees.
    const result = await LiveBookingService.executeBooking(context, {
      service: dto.serviceName,
      isoDate: dto.date,
      time24: dto.time,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
    });

    if (!result.success || !result.data?.appointment) {
      // `error` is a structured ToolError, not a string, so its message is surfaced rather than
      // stringified. The alternative - `String(result.error)` - would hand the caller
      // "[object Object]" and hide the actual reason the booking was refused.
      const reason = result.error?.message ?? 'The booking was refused and no appointment exists.';
      throw new Error(reason);
    }

    const appointment = result.data.appointment;
    return {
      appointmentId: appointment.id,
      tenantId: dto.tenantId,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      serviceName: dto.serviceName,
      date: dto.date,
      startTime: dto.time,
      status: result.status ?? 'CONFIRMED',
      // The live record keys the provider's reference on the adapter's own id; there is no
      // separate external id to report, and inventing one would be a fabricated fact.
      externalReference: appointment.id,
      createdAt: appointment.createdAt ?? Date.now(),
    };
  }
}
