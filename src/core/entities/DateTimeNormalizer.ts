import { NormalizedDate, NormalizedTime } from './EntityModel';

export class DateTimeNormalizer {
  /**
   * Deterministically resolves spoken relative or absolute date expressions into ISO and formatted strings.
   */
  public static normalizeDate(text: string, referenceDate: Date = new Date()): NormalizedDate | null {
    const lower = text.toLowerCase().trim();

    // 1. Today
    if (lower.includes('today') || lower.includes('this afternoon') || lower.includes('this evening')) {
      return {
        iso: referenceDate.toISOString().split('T')[0],
        display: referenceDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        isTentative: false,
      };
    }

    // 2. Tomorrow
    if (lower.includes('tomorrow')) {
      const tomorrow = new Date(referenceDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return {
        iso: tomorrow.toISOString().split('T')[0],
        display: tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        isTentative: false,
      };
    }

    // 3. Days of the week (e.g. "Friday", "this Friday", "next Friday")
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      const dayName = days[i];
      if (lower.includes(dayName)) {
        const isNextWeek = lower.includes(`next ${dayName}`);
        const currentDayIndex = referenceDate.getDay();
        let targetOffset = (i - currentDayIndex + 7) % 7;
        if (targetOffset === 0) targetOffset = 7; // next occurrence if same day
        if (isNextWeek) targetOffset += 7;

        const targetDate = new Date(referenceDate);
        targetDate.setDate(targetDate.getDate() + targetOffset);

        return {
          iso: targetDate.toISOString().split('T')[0],
          display: targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
          isTentative: false,
        };
      }
    }

    return null;
  }

  /**
   * Deterministically resolves spoken time expressions into 24-hour time and display time.
   */
  public static normalizeTime(text: string): NormalizedTime | null {
    const isApproximate = text.toLowerCase().includes('around') || text.toLowerCase().includes('about') || text.toLowerCase().includes('approx');

    // 1. Standard "2 PM", "2:30 PM", "11:00 AM"
    const standardMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i);
    if (standardMatch) {
      let hours = parseInt(standardMatch[1], 10);
      const minutes = standardMatch[2] ? parseInt(standardMatch[2], 10) : 0;
      const meridiem = standardMatch[3].toLowerCase().replace(/\./g, '');

      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      const time24 = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      const displayHours = hours % 12 || 12;
      const displayMins = minutes.toString().padStart(2, '0');
      const displayMeridiem = hours >= 12 ? 'PM' : 'AM';

      return {
        time24,
        display: `${displayHours}:${displayMins} ${displayMeridiem}`,
        isApproximate,
        flexibilityMinutes: isApproximate ? 30 : 0,
      };
    }

    // 2. Bare numbers with context (e.g. "at 2", "around 3")
    const bareMatch = text.match(/\b(?:at|around|about|for)\s+(\d{1,2})\b/i);
    if (bareMatch) {
      let hours = parseInt(bareMatch[1], 10);
      // Receptionist logic: Business appointments for 1..6 default to PM, 8..11 default to AM
      if (hours >= 1 && hours <= 6) hours += 12;

      const time24 = `${hours.toString().padStart(2, '0')}:00`;
      const displayHours = hours % 12 || 12;
      const displayMeridiem = hours >= 12 ? 'PM' : 'AM';

      return {
        time24,
        display: `${displayHours}:00 ${displayMeridiem}`,
        isApproximate: true,
        flexibilityMinutes: 30,
      };
    }

    return null;
  }
}
