import { TemporalParser, TemporalRequest } from './TemporalParser';
import { TimezoneService } from './TimezoneService';
import { BusinessHours } from './BusinessHours';
import { SchedulingPolicy } from './SchedulingPolicy';
import { NormalizedDate, NormalizedTime } from '../entities';

export interface ResolvedDateTimeResult {
  date: NormalizedDate | null;
  time: NormalizedTime | null;
  timezone: string;
  isAmbiguous: boolean;
  clarificationPrompt?: string;
  businessValidation?: {
    isOpen: boolean;
    reason?: string;
  };
  policyValidation?: {
    valid: boolean;
    error?: string;
  };
}

export class DateTimeResolver {
  /**
   * Fully resolves user temporal speech into concrete calendar, time, and business validation objects.
   */
  public static resolve(
    spokenText: string,
    personaId: string,
    referenceDate: Date = new Date()
  ): ResolvedDateTimeResult {
    const temporal = TemporalParser.parse(spokenText);
    const config = BusinessHours.getConfig(personaId);
    const timezone = config.timezone;

    let date: NormalizedDate | null = null;
    let time: NormalizedTime | null = null;

    // 1. Resolve Date
    if (temporal.dateExpr) {
      if (temporal.dateExpr === 'today') {
        date = {
          iso: TimezoneService.formatIsoDate(referenceDate, timezone),
          display: TimezoneService.formatDisplayDate(referenceDate, timezone),
          isTentative: false,
        };
      } else if (temporal.dateExpr === 'tomorrow') {
        const tomorrow = new Date(referenceDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        date = {
          iso: TimezoneService.formatIsoDate(tomorrow, timezone),
          display: TimezoneService.formatDisplayDate(tomorrow, timezone),
          isTentative: false,
        };
      } else {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        for (let i = 0; i < days.length; i++) {
          const d = days[i];
          if (temporal.dateExpr.includes(d)) {
            const currentDay = referenceDate.getDay();
            let offset = (i - currentDay + 7) % 7;
            if (offset === 0) offset = 7;
            if (temporal.dateExpr.includes('next')) offset += 7;

            const target = new Date(referenceDate);
            target.setDate(target.getDate() + offset);

            date = {
              iso: TimezoneService.formatIsoDate(target, timezone),
              display: TimezoneService.formatDisplayDate(target, timezone),
              isTentative: temporal.isAmbiguous,
            };
            break;
          }
        }
      }
    }

    // 2. Resolve Time
    if (temporal.timeExpr) {
      const match = temporal.timeExpr.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
      if (match) {
        let h = parseInt(match[1], 10);
        const m = match[2] ? parseInt(match[2], 10) : 0;
        const mer = match[3] ? match[3].toLowerCase() : null;

        if (mer === 'pm' && h < 12) h += 12;
        if (mer === 'am' && h === 12) h = 0;
        if (!mer && h >= 1 && h <= 6) h += 12; // Receptionist heuristic for afternoon appointments

        const time24 = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        time = {
          time24,
          display: TimezoneService.formatDisplayTime(time24),
          isApproximate: temporal.precision === 'APPROXIMATE',
          flexibilityMinutes: temporal.precision === 'APPROXIMATE' ? 30 : 0,
        };
      }
    }

    // 3. Business Hours Validation
    let businessValidation: ResolvedDateTimeResult['businessValidation'];
    if (date && time) {
      businessValidation = BusinessHours.isOpenAt(date.iso, time.time24, personaId);
    }

    // 4. Scheduling Policy Validation (Notice & Advance Window)
    let policyValidation: ResolvedDateTimeResult['policyValidation'];
    if (date && time) {
      policyValidation = SchedulingPolicy.validateRequest(date.iso, time.time24, 'General Service', personaId, referenceDate);
    }

    return {
      date,
      time,
      timezone,
      isAmbiguous: temporal.isAmbiguous,
      clarificationPrompt: temporal.clarificationPrompt,
      businessValidation,
      policyValidation,
    };
  }
}
