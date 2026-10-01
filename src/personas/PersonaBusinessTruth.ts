import { PersonaRegistry } from './PersonaRegistry';
import { getHolidayName } from '../core/time/FederalHolidays';
import type { PersonaDefinition } from './schema/persona.types';

export interface BusinessHoursInterval {
  open: string;
  close: string;
}

export interface BusinessHoursAnswer {
  /** Local calendar date in the business timezone, e.g. "2026-09-29". */
  localDate: string;
  /** Local weekday name, e.g. "Monday". */
  localDay: string;
  /** Human readable local time, e.g. "14:32". */
  localTime: string;
  timezone: string;
  isOpen: boolean;
  /** Present only when the business is open. */
  currentInterval: BusinessHoursInterval | null;
  /** Empty array means closed all day. */
  today: BusinessHoursInterval[];
  /** Lower-cased weekday keys -> intervals, for the full week. */
  week: Record<string, BusinessHoursInterval[]>;
  closedToday: boolean;
  holiday: boolean;
  /**
   * Why the business is closed, when it is a holiday or a declared closure.
   *
   * F-36: the answer used to be a bare `holiday: true`, so the agent could only tell a caller it
   * was closed. Naming the holiday is what lets it reschedule the caller to the next open day.
   */
  holidayName?: string;
  /** Set when the requested persona id is unknown and the fallback persona is used. */
  personaFallbackUsed?: boolean;
}

export interface ServicePriceAnswer {
  serviceName: string;
  /** null when the persona has no authoritative price for this service. */
  price: number | null;
  currency: string;
  /** True when `price` came from a real persona price rather than a guess. */
  authoritative: boolean;
  /** Services the persona does publish prices for, when a lookup fails. */
  availableServices?: Array<{ name: string; price: number }>;
  personaId: string;
}

export interface BusinessContactAnswer {
  businessName: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  timezone: string;
}

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

type DayKey = (typeof DAY_KEYS)[number];

const DAY_LABELS: Record<DayKey, string> = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
};

/** The shape of a single day's schedule as stored in a persona definition. */
interface DayScheduleLike {
  intervals?: BusinessHoursInterval[];
  closed?: boolean;
}

/**
 * SERVER-AUTHORITATIVE BUSINESS TRUTH
 *
 * Every price, schedule and contact detail the agent states to a caller must come from
 * here. The previous implementation returned hardcoded, incorrect values (a "9 to 5"
 * schedule for businesses that open at 07:30 or are closed on Sundays, and a fixed
 * "Oil Change $45" for every industry), which meant the agent confidently told callers
 * the wrong thing. When a fact is genuinely unknown this service returns `null` /
 * `authoritative: false` so the caller reports "I don't have that" rather than guessing.
 *
 * All time reasoning is performed in the BUSINESS timezone, never the server's local
 * timezone, which is a different bug the hardcoded version also had.
 */
export class PersonaBusinessTruth {
  /** Resolves a persona, flagging when the id was unknown and a fallback was used. */
  public static resolve(personaId: string): { persona: PersonaDefinition; fallbackUsed: boolean } {
    const known = PersonaRegistry.list().some((p) => p.id === personaId);
    if (known) {
      return { persona: PersonaRegistry.get(personaId), fallbackUsed: false };
    }
    return { persona: PersonaRegistry.get(personaId), fallbackUsed: true };
  }

  /**
   * Wall-clock fields for a business timezone at a given instant.
   */
  private static localFields(timezone: string, at: Date): { date: string; day: DayKey; time: string; minutes: number } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });

    const parts = formatter.formatToParts(at);
    const pick = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((p) => p.type === type)?.value ?? '';

    const year = pick('year');
    const month = pick('month');
    const dayOfMonth = pick('day');
    // Intl renders midnight as "24" in some environments; normalise it.
    const rawHour = pick('hour');
    const hour = rawHour === '24' ? '00' : rawHour;
    const minute = pick('minute');

    const weekdayShort = pick('weekday').toLowerCase();
    const weekday = (DAY_KEYS.find((d) => d.startsWith(weekdayShort.slice(0, 3))) ??
      'monday') as DayKey;

    return {
      date: `${year}-${month}-${dayOfMonth}`,
      day: weekday,
      time: `${hour}:${minute}`,
      minutes: Number(hour) * 60 + Number(minute),
    };
  }

  private static toMinutes(hhmm: string): number {
    const match = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
    if (!match) return Number.NaN;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  /**
   * Authoritative answer for "what are your hours / are you open right now".
   *
   * Never guesses. Closed days come straight from the persona definition; holidays are computed
   * from the real calendar plus the persona's own extra closures. F-36: this used to read a
   * hardcoded `holidays` array containing only 2026 dates, so a caller asking about 2027 was
   * told the business was open on Christmas.
   */
  public static getBusinessHours(personaId: string, at: Date = new Date()): BusinessHoursAnswer {
    const { persona, fallbackUsed } = PersonaBusinessTruth.resolve(personaId);
    const timezone = persona.business?.timezone || 'UTC';
    const { date, day, time, minutes } = PersonaBusinessTruth.localFields(timezone, at);

    const schedule = (persona.hours?.schedule ?? {}) as Record<string, DayScheduleLike | undefined>;
    const dayEntry = schedule[day];

    const extras = persona.hours?.holidays ?? [];
    const year = Number(date.slice(0, 4));
    const holidayName = Number.isFinite(year) ? getHolidayName(date, year, extras) : null;
    const isHoliday = holidayName !== null;

    const today = dayEntry?.closed ? [] : (dayEntry?.intervals ?? []).map((i) => ({ open: i.open, close: i.close }));

    const week: Record<string, BusinessHoursInterval[]> = {};
    for (const key of DAY_KEYS) {
      const entry = schedule[key];
      week[key] = entry?.closed ? [] : (entry?.intervals ?? []).map((i) => ({ open: i.open, close: i.close }));
    }

    const currentInterval =
      !isHoliday && today.length > 0
        ? today.find((i) => {
            const open = PersonaBusinessTruth.toMinutes(i.open);
            const close = PersonaBusinessTruth.toMinutes(i.close);
            return Number.isFinite(open) && Number.isFinite(close) && minutes >= open && minutes < close;
          }) ?? null
        : null;

    return {
      localDate: date,
      localDay: DAY_LABELS[day],
      localTime: time,
      timezone,
      isOpen: currentInterval !== null,
      currentInterval,
      today,
      week,
      closedToday: today.length === 0,
      holiday: isHoliday,
      ...(holidayName ? { holidayName } : {}),
      ...(fallbackUsed ? { personaFallbackUsed: true } : {}),
    };
  }

  /**
   * Authoritative answer for a service price.
   * Returns `price: null` when the persona publishes no price, so the agent asks rather
   * than quoting a fabricated number.
   */
  public static getServicePrice(personaId: string, serviceName: string): ServicePriceAnswer {
    const { persona } = PersonaBusinessTruth.resolve(personaId);
    const currency = persona.pricing?.currency ?? 'USD';

    // pricing.services is typed `number | string`. Only genuinely numeric entries are
    // quotable; a non-numeric value must never be coerced into a fake price.
    const table: Record<string, number> = {};
    for (const [name, raw] of Object.entries(persona.pricing?.services ?? {})) {
      const value = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(value)) {
        table[name] = value;
      }
    }

    const availableServices = Object.entries(table).map(([name, price]) => ({ name, price }));
    const needle = (serviceName || '').trim().toLowerCase();

    if (needle) {
      // Exact (case-insensitive) match first.
      for (const [name, price] of Object.entries(table)) {
        if (name.toLowerCase() === needle) {
          return { serviceName: name, price, currency, authoritative: true, personaId: persona.id };
        }
      }
      // Then a contains match, which handles conversational phrasing like
      // "how much is an oil change" against "Full Synthetic Oil Change".
      const partial = availableServices.find(
        (s) => s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase())
      );
      if (partial) {
        return {
          serviceName: partial.name,
          price: partial.price,
          currency,
          authoritative: true,
          personaId: persona.id,
        };
      }
    }

    return {
      serviceName: (serviceName || '').trim(),
      price: null,
      currency,
      authoritative: false,
      personaId: persona.id,
      availableServices,
    };
  }

  public static getContact(personaId: string): BusinessContactAnswer {
    const { persona } = PersonaBusinessTruth.resolve(personaId);
    const loc = persona.business?.location;
    const contact = persona.business?.contact;
    return {
      businessName: persona.business?.name ?? persona.identity?.businessName ?? 'Unknown business',
      phone: contact?.phone ?? '',
      email: contact?.email ?? '',
      website: contact?.website ?? '',
      address: loc ? `${loc.address}, ${loc.city}, ${loc.state} ${loc.postalCode}` : '',
      timezone: persona.business?.timezone ?? 'UTC',
    };
  }

  /** Service catalogue with durations, used for availability questions. */
  public static listServices(personaId: string) {
    const { persona } = PersonaBusinessTruth.resolve(personaId);
    return persona.services ?? [];
  }

  public static isToolAllowed(personaId: string, toolName: string): boolean {
    const { persona } = PersonaBusinessTruth.resolve(personaId);
    return (persona.tools?.allowed ?? []).includes(toolName);
  }

  public static getBookingPolicy(personaId: string) {
    const { persona } = PersonaBusinessTruth.resolve(personaId);
    return {
      enabled: persona.booking?.enabled ?? false,
      requiredEntities: persona.booking?.requiredEntities ?? [],
      confirmationRequired: persona.booking?.confirmationRequired ?? true,
      minNoticeHours: persona.booking?.minNoticeHours ?? 0,
      maxAdvanceDays: persona.booking?.maxAdvanceDays ?? 0,
      bufferMinutes: persona.booking?.bufferMinutes ?? 0,
      escalation: persona.escalation?.enabled
        ? {
            triggers: persona.escalation.triggers ?? [],
            defaultDepartment: persona.escalation.defaultDepartment ?? '',
            emergencyTransfer: persona.escalation.emergencyTransfer ?? false,
          }
        : null,
    };
  }

  /**
   * Cross-persona consistency audit. Returns human-readable problems so a broken price
   * table or a service with no entry is caught at startup rather than on a live call.
   *
   * `isToolImplemented` is injected rather than imported so this module stays independent
   * of the tool layer. The decision of which tools actually exist belongs to ToolGateway,
   * which owns the handler registry; consulting a hand-maintained list here is exactly how
   * the two drifted apart in the first place.
   */
  public static auditRegistry(isToolImplemented?: (toolName: string) => boolean): string[] {
    const problems: string[] = [];
    const personas = PersonaRegistry.list();

    for (const persona of personas) {
      const label = persona.id;

      if (!persona.business?.timezone) {
        problems.push(`${label}: missing business.timezone`);
      }
      if (!persona.hours?.schedule || Object.keys(persona.hours.schedule).length === 0) {
        problems.push(`${label}: empty hours.schedule`);
      } else {
        for (const key of DAY_KEYS) {
          const entry = (persona.hours.schedule as Record<string, DayScheduleLike | undefined>)[key];
          if (!entry) {
            problems.push(`${label}: hours.schedule is missing "${key}"`);
          } else if (!entry.closed && (!entry.intervals || entry.intervals.length === 0)) {
            problems.push(`${label}: hours.schedule.${key} is neither closed nor has any interval`);
          }
        }
      }

      const prices = persona.pricing?.services ?? {};
      for (const service of persona.services ?? []) {
        if (!(service.name in prices)) {
          problems.push(
            `${label}: service "${service.name}" has no entry in pricing.services ` +
              `(the agent would be unable to quote it)`
          );
        }
      }
      for (const priceName of Object.keys(prices)) {
        if (!(persona.services ?? []).some((s) => s.name === priceName)) {
          problems.push(`${label}: pricing.services contains "${priceName}" which is not a declared service`);
        }
      }

      if (!persona.systemPrompt || persona.systemPrompt.trim().length < 20) {
        problems.push(`${label}: systemPrompt is missing or too short`);
      }
      if (!persona.conversationStyle?.greetingPhrase) {
        problems.push(`${label}: conversationStyle.greetingPhrase is missing`);
      }
      if (!persona.tools?.allowed || persona.tools.allowed.length === 0) {
        problems.push(`${label}: tools.allowed is empty`);
      }
      for (const tool of persona.tools?.allowed ?? []) {
        if (isToolImplemented && !isToolImplemented(tool)) {
          problems.push(`${label}: allows tool "${tool}" but no handler is registered in ToolGateway`);
        }
      }
    }

    return problems;
  }
}
