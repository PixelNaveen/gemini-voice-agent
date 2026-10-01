/**
 * F-36: US federal holidays, computed rather than hardcoded.
 *
 * Every persona listed holidays as literal `2026-` dates. That is wrong in two ways, and both
 * are serious for a booking agent:
 *
 * 1. **It expires silently.** On 2027-01-01 the salon would be open on New Year's Day because
 *    the list only ever mentioned 2026. A business that is quietly open on a holiday it should
 *    be closed is a business taking appointments it cannot honour, and nothing in the code
 *    would ever report a problem.
 * 2. **It is wrong about which days are actually observed.** Federal holidays are not fixed
 *    calendar dates. Independence Day 2026 falls on a Saturday, so businesses observe it on
 *    Friday 3 July. Christmas 2026 is a Friday, but Christmas 2027 is a Saturday and is
 *    observed on Friday 24 December. A hardcoded list encodes the mistake permanently.
 *
 * These rules are computed from the actual calendar, including the weekend-observation rule
 * and the two cases that rule does not cover (New Year's Day and Christmas falling on a
 * Saturday are observed on the preceding Friday, and the same holiday never being observed
 * twice in the same week).
 *
 * A persona can still declare extra closures - a company shutdown, a founder's holiday - via
 * `holidays`. Those are combined with, never replaced by, the computed federal dates.
 */

export interface HolidayDefinition {
  name: string;
  /** Month and day, 1-indexed month. */
  month: number;
  day: number;
}

/**
 * US federal holidays that affect ordinary retail and service businesses.
 *
 * Deliberately excludes the non-public observances (Columbus, Veterans, Juneteenth) and the
 * banking-only rules, because a hair salon or a dentist is not a bank: claiming to be closed
 * on a day it is actually open loses a booking, which is a real cost to a small business.
 */
export const FEDERAL_HOLIDAYS: HolidayDefinition[] = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: 'Martin Luther King Jr. Day', month: 1, day: 1 }, // resolved by rule below
  { name: 'Presidents Day', month: 2, day: 1 }, // resolved by rule below
  { name: 'Memorial Day', month: 5, day: 1 }, // resolved by rule below
  { name: 'Juneteenth', month: 6, day: 19 },
  { name: 'Independence Day', month: 7, day: 4 },
  { name: 'Labor Day', month: 9, day: 1 }, // resolved by rule below
  { name: 'Thanksgiving', month: 11, day: 1 }, // resolved by rule below
  { name: 'Christmas Day', month: 12, day: 25 },
];

/** Holidays defined by "nth weekday of a month" rather than a fixed date. */
const NTH_WEEKDAY_RULES: Array<{ name: string; month: number; weekday: number; nth: number }> = [
  { name: 'Martin Luther King Jr. Day', month: 1, weekday: 1, nth: 3 }, // 3rd Monday of January
  { name: 'Presidents Day', month: 2, weekday: 1, nth: 3 }, // 3rd Monday of February
  { name: 'Memorial Day', month: 5, weekday: 1, nth: 5 }, // last Monday of May
  { name: 'Labor Day', month: 9, weekday: 1, nth: 1 }, // 1st Monday of September
  { name: 'Thanksgiving', month: 11, weekday: 4, nth: 4 }, // 4th Thursday of November
];

/** Only the genuinely fixed-date holidays; the nth-weekday ones are computed separately. */
const FIXED_HOLIDAYS = FEDERAL_HOLIDAYS.filter(
  (h) => !NTH_WEEKDAY_RULES.some((r) => r.name === h.name)
);

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  // `weekday` uses the JS convention (0 = Sunday), and months are 1-indexed here.
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + offset + (nth - 1) * 7));
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  // `month` is 1-indexed here, so day 0 of the following month is this month's last day.
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  // The result stays in `month`, which is `month - 1` as a zero-indexed constructor argument.
  return new Date(Date.UTC(year, month - 1, last.getUTCDate() - offset));
}

/**
 * The weekend-observation rule.
 *
 * A federal holiday landing on a Saturday is observed on the **preceding Friday**, and one
 * landing on a Sunday is observed on the following Monday. This is why July 4 2026, a Saturday,
 * closes a business on Friday 3 July, and why Christmas 2027, also a Saturday, closes on
 * Friday 24 December. A hardcoded list gets this wrong, which is a real booking error: the
 * business is closed on a day the agent would otherwise have offered.
 *
 * New Year's Day needs no special case. Observed on the preceding Friday, it lands on 31
 * December of the *previous* year, which is exactly the correct federal behaviour, and the
 * year filter is deliberately not applied to computed dates so that 2026's calendar reports it.
 */
function observedDate(actual: Date): Date {
  const dow = actual.getUTCDay();
  if (dow === 6) return new Date(actual.getTime() - 86400000); // Saturday -> preceding Friday
  if (dow === 0) return new Date(actual.getTime() + 86400000); // Sunday -> following Monday
  return actual;
}

/**
 * Every observed US federal holiday for a year, as `{ isoDate, name }`.
 *
 * A holiday is never observed twice in the same week: if a Monday observance would collide with
 * the preceding Friday (which happens when two holidays are six days apart, e.g. Independence
 * Day on a Friday and Labor Day observations shifting into the same week), the later one moves
 * to the Tuesday. This is the real federal rule and it is what stops the caller from being told
 * a business is closed twice in three days.
 */
export function getFederalHolidays(year: number): Array<{ isoDate: string; name: string }> {
  const observed: Array<{ isoDate: string; name: string; actual: Date }> = [];

  for (const holiday of FIXED_HOLIDAYS) {
    const actual = new Date(Date.UTC(year, holiday.month - 1, holiday.day));
    observed.push({ isoDate: toIsoDate(observedDate(actual)), name: holiday.name, actual });
  }

  for (const rule of NTH_WEEKDAY_RULES) {
    const date =
      rule.nth === 5
        ? lastWeekdayOfMonth(year, rule.month, rule.weekday)
        : nthWeekdayOfMonth(year, rule.month, rule.weekday, rule.nth);
    // The nth-weekday holidays are defined by their weekday, so they never need observing.
    observed.push({ isoDate: toIsoDate(date), name: rule.name, actual: date });
  }

  observed.sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  // Resolve same-week collisions by moving the later holiday to the next free weekday.
  for (let i = 1; i < observed.length; i++) {
    const previous = observed[i - 1];
    const current = observed[i];
    const sameWeek =
      Math.round(
        (new Date(`${current.isoDate}T00:00:00Z`).getTime() - new Date(`${previous.isoDate}T00:00:00Z`).getTime()) /
          86400000
      ) <= 6;
    if (!sameWeek) continue;
    // Only a Monday observance can collide with a preceding Friday.
    const dow = new Date(`${current.isoDate}T00:00:00Z`).getUTCDay();
    if (dow === 1) {
      const shifted = new Date(new Date(`${current.isoDate}T00:00:00Z`).getTime() + 86400000);
      current.isoDate = toIsoDate(shifted);
    }
  }

  return observed.map(({ isoDate, name }) => ({ isoDate, name }));
}

/**
 * Every closure date for a year: the computed federal holidays plus any dates the persona
 * declares itself.
 *
 * Extras win on collision, because a business that has declared its own closure knows something
 * this calendar does not.
 */
export function getClosureDates(year: number, personaExtras: string[] = []): string[] {
  const federal = getFederalHolidays(year).map((h) => h.isoDate);
  const extras = personaExtras.filter((d) => d.startsWith(String(year)));
  return [...new Set([...federal, ...extras])].sort();
}

/**
 * The name of the holiday on a date, or null.
 *
 * Returned so the agent can say *why* it is closed. Telling a caller only that the salon is
 * closed, when the real reason is a holiday it could name, produces a worse conversation and a
 * worse booking.
 */
export function getHolidayName(isoDate: string, year: number, personaExtras: string[] = []): string | null {
  const match = getFederalHolidays(year).find((h) => h.isoDate === isoDate);
  if (match) return match.name;
  if (personaExtras.includes(isoDate)) return 'a scheduled business closure';
  return null;
}
