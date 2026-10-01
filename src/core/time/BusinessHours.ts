import { getFederalHolidays } from './FederalHolidays';

export interface TimeInterval {
  open: string; // "09:00"
  close: string; // "18:00"
}
export interface DaySchedule {
  intervals: TimeInterval[];
  isClosed?: boolean;
}

export type WeeklySchedule = Record<string, DaySchedule>; // 'monday', 'tuesday', etc.

export interface BusinessHoursConfig {
  timezone: string;
  schedule: WeeklySchedule;
  /**
   * Extra closures the business declares itself - a company shutdown, a private event.
   *
   * F-36: these used to be a hardcoded list of *federal* holidays for one year, which meant the
   * business was silently open on holidays in every other year and never explained a closure.
   * US federal holidays are now computed from the calendar (see `FederalHolidays.ts`), so this
   * field holds only the dates the calendar cannot know. Extras are combined with the computed
   * dates, never a replacement for them.
   */
  holidays?: string[];
}

export const DEFAULT_BUSINESS_HOURS: Record<string, BusinessHoursConfig> = {
  'aura-salon': {
    timezone: 'America/New_York',
    schedule: {
      monday: { intervals: [{ open: '09:00', close: '19:00' }] },
      tuesday: { intervals: [{ open: '09:00', close: '19:00' }] },
      wednesday: { intervals: [{ open: '09:00', close: '19:00' }] },
      thursday: { intervals: [{ open: '09:00', close: '20:00' }] },
      friday: { intervals: [{ open: '09:00', close: '20:00' }] },
      saturday: { intervals: [{ open: '09:00', close: '18:00' }] },
      sunday: { intervals: [], isClosed: true },
    },
    holidays: [],
  },
  'apex-dental': {
    timezone: 'America/New_York',
    schedule: {
      monday: { intervals: [{ open: '08:00', close: '17:00' }] },
      tuesday: { intervals: [{ open: '08:00', close: '17:00' }] },
      wednesday: { intervals: [{ open: '08:00', close: '17:00' }] },
      thursday: { intervals: [{ open: '08:00', close: '17:00' }] },
      friday: { intervals: [{ open: '08:00', close: '15:00' }] },
      saturday: { intervals: [], isClosed: true },
      sunday: { intervals: [], isClosed: true },
    },
    holidays: [],
  },
  'precision-auto': {
    timezone: 'America/New_York',
    schedule: {
      monday: { intervals: [{ open: '07:30', close: '18:00' }] },
      tuesday: { intervals: [{ open: '07:30', close: '18:00' }] },
      wednesday: { intervals: [{ open: '07:30', close: '18:00' }] },
      thursday: { intervals: [{ open: '07:30', close: '18:00' }] },
      friday: { intervals: [{ open: '07:30', close: '18:00' }] },
      saturday: { intervals: [{ open: '08:00', close: '14:00' }] },
      sunday: { intervals: [], isClosed: true },
    },
    holidays: [],
  },
};

/**
 * F-36: resolved closures for a year, memoised.
 *
 * The computation is pure and cheap, but `isOpenAt` runs once per candidate slot when building
 * availability, so an un-memoised call would re-derive a full year of holiday rules for every
 * slot. The cache is keyed by year and by the persona's own extra closures, so a persona that
 * declares a shutdown is still respected and never reads another persona's answer.
 */
const closureCache = new Map<string, { dates: string[]; names: Map<string, string> }>();

function resolveClosures(year: number, extras: string[]): { dates: string[]; names: Map<string, string> } {
  const key = `${year}|${[...extras].sort().join(',')}`;
  const cached = closureCache.get(key);
  if (cached) return cached;
  const names = new Map<string, string>();
  for (const holiday of getFederalHolidays(year)) names.set(holiday.isoDate, holiday.name);
  for (const extra of extras) {
    if (extra.startsWith(String(year)) && !names.has(extra)) names.set(extra, 'a scheduled business closure');
  }
  const resolved = { dates: [...names.keys()].sort(), names };
  closureCache.set(key, resolved);
  return resolved;
}

export class BusinessHours {
  public static getConfig(personaId: string): BusinessHoursConfig {
    return DEFAULT_BUSINESS_HOURS[personaId] || DEFAULT_BUSINESS_HOURS['aura-salon'];
  }

  /**
   * Checks whether the business is open at the specified date and 24-hr time.
   */
  public static isOpenAt(isoDate: string, time24: string, personaId: string): { isOpen: boolean; reason?: string } {
    const config = this.getConfig(personaId);

    // 1. Closure check: computed federal holidays plus the persona's own extra closures.
    const year = Number(isoDate.slice(0, 4));
    const extras = config.holidays ?? [];
    if (Number.isFinite(year)) {
      const closures = resolveClosures(year, extras);
      const closureName = closures.names.get(isoDate);
      if (closureName) {
        return { isOpen: false, reason: `Business is closed for ${closureName}.` };
      }
    }

    // 2. Day of Week Check
    const dateObj = new Date(`${isoDate}T12:00:00Z`);
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dateObj.getUTCDay()];
    const daySchedule = config.schedule[dayName];

    if (!daySchedule || daySchedule.isClosed || daySchedule.intervals.length === 0) {
      return { isOpen: false, reason: `Business is closed on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s.` };
    }

    // 3. Time Interval Check
    const requestedMinutes = this.timeToMinutes(time24);
    for (const interval of daySchedule.intervals) {
      const openMin = this.timeToMinutes(interval.open);
      const closeMin = this.timeToMinutes(interval.close);
      if (requestedMinutes >= openMin && requestedMinutes < closeMin) {
        return { isOpen: true };
      }
    }

    const intervalsDisplay = daySchedule.intervals.map((i) => `${i.open} to ${i.close}`).join(', ');
    return {
      isOpen: false,
      reason: `Outside regular operating hours on ${dayName} (${intervalsDisplay}).`,
    };
  }

  private static timeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map((n) => parseInt(n, 10));
    return h * 60 + (m || 0);
  }
}
