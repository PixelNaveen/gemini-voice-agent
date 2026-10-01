export class TimezoneService {
  /**
   * Default business timezone (IANA format).
   */
  public static readonly DEFAULT_TIMEZONE = 'America/New_York';

  /**
   * Returns current Date in the context of the business timezone.
   */
  public static getNow(timezone = this.DEFAULT_TIMEZONE): Date {
    return new Date();
  }

  /**
   * Formats a given Date object to an ISO date string (YYYY-MM-DD) in the specified timezone.
   */
  public static formatIsoDate(date: Date, timezone = this.DEFAULT_TIMEZONE): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  }

  /**
   * Formats a given Date to a full localized display string.
   */
  public static formatDisplayDate(date: Date, timezone = this.DEFAULT_TIMEZONE): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    return formatter.format(date);
  }

  /**
   * Formats time (HH:mm) into a localized 12-hour display string.
   */
  public static formatDisplayTime(time24: string): string {
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr, 10);
    const m = mStr || '00';
    const displayH = h % 12 || 12;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${displayH}:${m} ${ampm}`;
  }

  /**
   * Creates an ISO timestamp with explicit timezone offset for an appointment instant.
   */
  public static createAppointmentIso(isoDate: string, time24: string, timezone = this.DEFAULT_TIMEZONE): string {
    return `${isoDate}T${time24}:00 [${timezone}]`;
  }
}
