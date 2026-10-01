export interface ServiceDurationMap {
  [serviceName: string]: number; // in minutes
}

export interface PersonaSchedulingPolicy {
  minNoticeHours: number;
  maxAdvanceDays: number;
  bufferMinutes: number;
  cancellationNoticeHours: number;
  serviceDurations: ServiceDurationMap;
  defaultDurationMinutes: number;
}

export const DEFAULT_SCHEDULING_POLICIES: Record<string, PersonaSchedulingPolicy> = {
  'aura-salon': {
    minNoticeHours: 2,
    maxAdvanceDays: 60,
    bufferMinutes: 15,
    cancellationNoticeHours: 24,
    defaultDurationMinutes: 60,
    serviceDurations: {
      'Haircut': 45,
      'Blowout': 45,
      'Full Color': 90,
      'Balayage': 150,
      'HydraFacial': 60,
      'Manicure': 40,
      'Pedicure': 50,
    },
  },
  'apex-dental': {
    minNoticeHours: 3,
    maxAdvanceDays: 90,
    bufferMinutes: 15,
    cancellationNoticeHours: 24,
    defaultDurationMinutes: 45,
    serviceDurations: {
      'Dental Cleaning': 60,
      'Comprehensive Exam': 30,
      'Composite Filling': 60,
      'Teeth Whitening': 75,
      'Root Canal': 90,
      'Emergency Exam': 30,
    },
  },
  'precision-auto': {
    minNoticeHours: 2,
    maxAdvanceDays: 45,
    bufferMinutes: 15,
    cancellationNoticeHours: 12,
    defaultDurationMinutes: 60,
    serviceDurations: {
      'Full Synthetic Oil Change': 45,
      'Brake Pad Replacement': 90,
      'Computer Diagnostics': 60,
      'Wheel Alignment': 60,
      'Tire Patch': 30,
    },
  },
};

export class SchedulingPolicy {
  public static getPolicy(personaId: string): PersonaSchedulingPolicy {
    return (
      DEFAULT_SCHEDULING_POLICIES[personaId] || {
        minNoticeHours: 2,
        maxAdvanceDays: 60,
        bufferMinutes: 15,
        cancellationNoticeHours: 24,
        defaultDurationMinutes: 60,
        serviceDurations: {},
      }
    );
  }

  public static getDurationForService(service: string, personaId: string): number {
    const policy = this.getPolicy(personaId);
    for (const [s, dur] of Object.entries(policy.serviceDurations)) {
      if (service.toLowerCase().includes(s.toLowerCase())) {
        return dur;
      }
    }
    return policy.defaultDurationMinutes;
  }

  /**
   * Validates whether an appointment request satisfies notice rules and booking windows.
   */
  public static validateRequest(
    isoDate: string,
    time24: string,
    service: string,
    personaId: string,
    now: Date = new Date()
  ): { valid: boolean; error?: string } {
    const policy = this.getPolicy(personaId);

    // Target appointment Date
    const targetDate = new Date(`${isoDate}T${time24}:00`);

    // 1. Past Time Check
    if (targetDate.getTime() <= now.getTime()) {
      return { valid: false, error: 'Appointment time must be in the future.' };
    }

    // 2. Minimum Notice Check
    const diffHours = (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHours < policy.minNoticeHours) {
      return {
        valid: false,
        error: `Appointments require at least ${policy.minNoticeHours} hours advance notice.`,
      };
    }

    // 3. Maximum Advance Booking Check
    const diffDays = diffHours / 24;
    if (diffDays > policy.maxAdvanceDays) {
      return {
        valid: false,
        error: `Bookings can only be scheduled up to ${policy.maxAdvanceDays} days in advance.`,
      };
    }

    return { valid: true };
  }
}
