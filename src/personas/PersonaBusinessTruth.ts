import { PersonaRegistry } from './PersonaRegistry';
import { getHolidayName } from '../core/time/FederalHolidays';
import type {
  PersonaDefinition,
  ServiceItem,
  PriceType,
  BusinessHoursInterval,
  EscalationTrigger,
} from './schema/persona.types';

export { BusinessHoursInterval };

export interface BusinessHoursAnswer {
  localDate: string;
  localDay: string;
  localTime: string;
  timezone: string;
  isOpen: boolean;
  currentInterval: BusinessHoursInterval | null;
  today: BusinessHoursInterval[];
  week: Record<string, BusinessHoursInterval[]>;
  closedToday: boolean;
  holiday: boolean;
  holidayName?: string;
  personaFallbackUsed?: boolean;
  emergencyHours?: {
    alwaysOn: boolean;
    serviceIds?: string[];
    note?: string;
  };
}

export interface ServiceInfoFound {
  found: true;
  ambiguous: false;
  service: ServiceItem;
  serviceId: string;
  serviceName: string;
  priceType: PriceType;
  price: number | null;
  priceNote?: string;
  spokenPrice: string;
  prepNote?: string;
  durationMinutes: number;
  bookable: boolean;
  currency: string;
  personaId: string;
}

export interface ServiceInfoAmbiguous {
  found: false;
  ambiguous: true;
  query: string;
  options: ServiceItem[];
  message: string;
  personaId: string;
}

export interface ServiceInfoNotFound {
  found: false;
  ambiguous: false;
  query: string;
  personaId: string;
  availableServices: Array<{
    id: string;
    name: string;
    priceType: PriceType;
    price: number | null;
    priceNote?: string;
  }>;
}

export type ServiceInfoAnswer =
  | ServiceInfoFound
  | ServiceInfoAmbiguous
  | ServiceInfoNotFound;

export interface ServicePriceAnswer {
  serviceName: string;
  price: number | null;
  priceType?: PriceType;
  currency: string;
  authoritative: boolean;
  spokenPrice?: string;
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

interface DayScheduleLike {
  intervals?: BusinessHoursInterval[];
  closed?: boolean;
}

export class PersonaBusinessTruth {
  public static resolve(personaId: string): { persona: PersonaDefinition; fallbackUsed: boolean } {
    const known = PersonaRegistry.list().some((p) => p.id === personaId);
    if (known) {
      return { persona: PersonaRegistry.get(personaId), fallbackUsed: false };
    }
    return { persona: PersonaRegistry.get(personaId), fallbackUsed: true };
  }

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

  public static toMinutes(hhmm: string, isClose = false): number {
    const trimmed = (hhmm || '').trim();
    if (trimmed === '24:00') return 1440;
    if (trimmed === '00:00') return isClose ? 1440 : 0;

    const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (!match) return Number.NaN;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  public static formatSpokenPrice(service: ServiceItem): string {
    const note = service.priceNote ? ` (${service.priceNote})` : '';
    switch (service.priceType) {
      case 'complimentary':
        return 'complimentary (no charge)';
      case 'menu_based':
        return service.priceNote || 'a la carte / menu based (no set price)';
      case 'quote_required':
        return service.priceNote
          ? `quoted upon consultation${note}`
          : 'quoted upon consultation';
      case 'starting_at':
        return service.price !== null
          ? `starts at $${service.price}${note}`
          : `starts at a variable rate${note}`;
      case 'fixed':
      default:
        return service.price !== null ? `$${service.price}${note}` : `variable${note}`;
    }
  }

  /**
   * Authoritative answer for "what are your hours / are you open right now".
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
            const open = PersonaBusinessTruth.toMinutes(i.open, false);
            let close = PersonaBusinessTruth.toMinutes(i.close, true);
            if (close <= open) close += 1440;
            return Number.isFinite(open) && Number.isFinite(close) && minutes >= open && minutes < close;
          }) ?? null
        : null;

    const emergencyHours = persona.hours?.emergencyHours;

    return {
      localDate: date,
      localDay: DAY_LABELS[day],
      localTime: time,
      timezone,
      isOpen: currentInterval !== null || Boolean(emergencyHours?.alwaysOn),
      currentInterval,
      today,
      week,
      closedToday: today.length === 0,
      holiday: isHoliday,
      ...(holidayName ? { holidayName } : {}),
      ...(fallbackUsed ? { personaFallbackUsed: true } : {}),
      ...(emergencyHours ? { emergencyHours } : {}),
    };
  }

  /**
   * Authoritative lookup for service info and pricing in schema v2.0.0.
   * Matches service names and aliases case-insensitively, handling ambiguity cleanly.
   */
  public static getServiceInfo(personaId: string, query: string): ServiceInfoAnswer {
    const { persona } = PersonaBusinessTruth.resolve(personaId);
    const services = persona.services ?? [];
    const needle = (query || '').trim().toLowerCase();

    if (!needle) {
      return {
        found: false,
        ambiguous: false,
        query: '',
        personaId: persona.id,
        availableServices: services.map((s) => ({
          id: s.id,
          name: s.name,
          priceType: s.priceType,
          price: s.price,
          priceNote: s.priceNote,
        })),
      };
    }

    // 1. Exact match on service name or exact alias
    const exactMatches: ServiceItem[] = [];
    for (const s of services) {
      if (s.name.toLowerCase() === needle) {
        exactMatches.push(s);
        continue;
      }
      if (s.aliases && s.aliases.some((a) => a.toLowerCase() === needle)) {
        exactMatches.push(s);
      }
    }

    if (exactMatches.length === 1) {
      const match = exactMatches[0];
      return {
        found: true,
        ambiguous: false,
        service: match,
        serviceId: match.id,
        serviceName: match.name,
        priceType: match.priceType,
        price: match.price,
        priceNote: match.priceNote,
        spokenPrice: PersonaBusinessTruth.formatSpokenPrice(match),
        prepNote: match.prepNote,
        durationMinutes: match.durationMinutes,
        bookable: match.bookable,
        currency: 'USD',
        personaId: persona.id,
      };
    }

    if (exactMatches.length > 1) {
      const names = exactMatches.map((s) => s.name).join(', ');
      return {
        found: false,
        ambiguous: true,
        query,
        options: exactMatches,
        message: `We offer multiple options for "${query}": ${names}. Which one would you like details on?`,
        personaId: persona.id,
      };
    }

    // 2. Partial / word matches
    const partialMatches: ServiceItem[] = [];
    for (const s of services) {
      const sName = s.name.toLowerCase();
      const inName = sName.includes(needle) || needle.includes(sName);
      const inAlias = (s.aliases ?? []).some((a) => {
        const aLower = a.toLowerCase();
        return aLower.includes(needle) || needle.includes(aLower);
      });
      if (inName || inAlias) {
        partialMatches.push(s);
      }
    }

    if (partialMatches.length === 1) {
      const match = partialMatches[0];
      return {
        found: true,
        ambiguous: false,
        service: match,
        serviceId: match.id,
        serviceName: match.name,
        priceType: match.priceType,
        price: match.price,
        priceNote: match.priceNote,
        spokenPrice: PersonaBusinessTruth.formatSpokenPrice(match),
        prepNote: match.prepNote,
        durationMinutes: match.durationMinutes,
        bookable: match.bookable,
        currency: 'USD',
        personaId: persona.id,
      };
    }

    if (partialMatches.length > 1) {
      const names = partialMatches.map((s) => s.name).join(', ');
      return {
        found: false,
        ambiguous: true,
        query,
        options: partialMatches,
        message: `We have a few options related to "${query}": ${names}. Which one did you have in mind?`,
        personaId: persona.id,
      };
    }

    return {
      found: false,
      ambiguous: false,
      query,
      personaId: persona.id,
      availableServices: services.map((s) => ({
        id: s.id,
        name: s.name,
        priceType: s.priceType,
        price: s.price,
        priceNote: s.priceNote,
      })),
    };
  }

  /**
   * Backwards-compatible wrapper around getServiceInfo.
   */
  public static getServicePrice(personaId: string, serviceName: string): ServicePriceAnswer {
    const info = PersonaBusinessTruth.getServiceInfo(personaId, serviceName);
    const { persona } = PersonaBusinessTruth.resolve(personaId);
    if (info.found) {
      return {
        serviceName: info.serviceName,
        price: info.price,
        priceType: info.priceType,
        spokenPrice: info.spokenPrice,
        currency: 'USD',
        authoritative: true,
        personaId: persona.id,
      };
    }
    const available = (persona.services ?? []).map((s) => ({
      name: s.name,
      price: s.price ?? 0,
    }));
    return {
      serviceName: (serviceName || '').trim(),
      price: null,
      currency: 'USD',
      authoritative: false,
      personaId: persona.id,
      availableServices: available,
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
      address: loc ? `${loc.address}, ${loc.city}, ${loc.state ? loc.state + ' ' : ''}${loc.postalCode ?? ''}`.trim() : '',
      timezone: persona.business?.timezone ?? 'UTC',
    };
  }

  public static listServices(personaId: string): ServiceItem[] {
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
      minLeadHours: persona.booking?.minLeadHours ?? (persona.booking as any)?.minNoticeHours ?? 0,
      minNoticeHours: persona.booking?.minLeadHours ?? (persona.booking as any)?.minNoticeHours ?? 0,
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
   * Cross-persona consistency audit for Schema v2.0.0.
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

      // Services validation
      const seenServiceIds = new Set<string>();
      const declaredServices = persona.services ?? [];

      for (const service of declaredServices) {
        if (seenServiceIds.has(service.id)) {
          problems.push(`${label}: duplicate service id "${service.id}"`);
        }
        seenServiceIds.add(service.id);

        if (!service.aliases || service.aliases.length === 0) {
          problems.push(`${label}: service "${service.name}" (${service.id}) has no aliases`);
        }

        const hasResource = (persona.resources ?? []).some((r) =>
          r.serviceIds.includes(service.id)
        );
        if (!hasResource) {
          problems.push(
            `${label}: service "${service.name}" (${service.id}) has no capable resource in resources[]`
          );
        }
      }

      // Resources validation
      for (const resource of persona.resources ?? []) {
        for (const sId of resource.serviceIds) {
          if (!seenServiceIds.has(sId)) {
            problems.push(
              `${label}: resource "${resource.name}" (${resource.id}) references unknown serviceId "${sId}"`
            );
          }
        }
      }

      // SeededBusy validation
      for (const busy of persona.seededBusy ?? []) {
        const resourceExists = (persona.resources ?? []).some((r) => r.id === busy.resourceId);
        if (!resourceExists) {
          problems.push(`${label}: seededBusy references unknown resourceId "${busy.resourceId}"`);
        }
      }

      // Escalation triggers validation
      for (const trigger of persona.escalation?.triggers ?? []) {
        if (typeof trigger !== 'object' || !trigger.id || !trigger.action) {
          problems.push(`${label}: escalation trigger is not a valid object with id and action`);
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
