import { resolveDate, resolveTime, resolveWhen } from './DateResolver';
const TZ = 'America/New_York';
const at = (iso: string) => new Date(iso); // noon-ish New York times given in UTC
let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}
const MON = at('2026-10-05T16:00:00Z'), WED = at('2026-10-07T16:00:00Z'), FRI = at('2026-10-09T16:00:00Z'),
      SAT = at('2026-10-03T16:00:00Z'), SUN = at('2026-10-04T16:00:00Z'), DEC30 = at('2026-12-30T17:00:00Z'), MAR27 = at('2027-03-01T17:00:00Z');
const d = (p: string, now: Date, pol?: any) => { const r = resolveDate(p, { timezone: TZ, now, nextWeekdayPolicy: pol }); return [r.confidence, r.date ?? r.candidates]; };

// Monday Oct 5 2026 (your example)
eq('mon: friday', d('Friday', MON), ['exact', '2026-10-09']);
eq('mon: this friday', d('this Friday', MON), ['exact', '2026-10-09']);
eq('mon: next friday asks', d('next Friday', MON), ['ambiguous', ['2026-10-09', '2026-10-16']]);
eq('mon: next friday policy upcoming', d('next Friday', MON, 'upcoming'), ['assumed', '2026-10-09']);
eq('mon: next friday policy following', d('next Friday', MON, 'following_week'), ['assumed', '2026-10-16']);
eq('mon: friday next week', d('Friday next week', MON), ['exact', '2026-10-16']);
eq('mon: friday of this week', d('friday of this week', MON), ['exact', '2026-10-09']);
eq('mon: tomorrow', d('tomorrow', MON), ['exact', '2026-10-06']);
eq('mon: day after tomorrow', d('the day after tomorrow', MON), ['exact', '2026-10-07']);
eq('mon: in 2 weeks', d('in two weeks', MON), ['assumed', '2026-10-19']);
eq('mon: week from friday', d('a week from Friday', MON), ['exact', '2026-10-16']);
eq('mon: monday is today (bare)', d('Monday', MON), ['assumed', '2026-10-05']);
eq('mon: this weekend', d('this weekend', MON), ['ambiguous', ['2026-10-10', '2026-10-11']]);
eq('mon: next week', resolveDate('next week', { timezone: TZ, now: MON }).range, { start: '2026-10-12', end: '2026-10-18' });
// Wednesday
eq('wed: this monday passed', d('this Monday', WED), ['assumed', '2026-10-12']);
eq('wed: monday', d('Monday', WED), ['exact', '2026-10-12']);
eq('wed: next monday', d('next Monday', WED), ['exact', '2026-10-12']);
eq('wed: last friday', d('last Friday', WED), ['unresolved', []]);
// Weekend / Friday edge cases
eq('sat: next monday', d('next Monday', SAT), ['exact', '2026-10-05']);
eq('sat: this weekend', d('this weekend', SAT), ['ambiguous', ['2026-10-03', '2026-10-04']]);
eq('sun: this weekend', d('this weekend', SUN), ['assumed', '2026-10-04']);
eq('fri: friday bare', d('Friday', FRI), ['assumed', '2026-10-09']);
eq('fri: next friday', d('next Friday', FRI), ['exact', '2026-10-16']);
// Calendar dates
eq('oct 9th', d('October 9th', MON), ['exact', '2026-10-09']);
eq('oct 3 rolls year', d('oct 3', MON), ['assumed', '2027-10-03']);
eq('10/9', d('10/9', MON), ['exact', '2026-10-09']);
eq('the 9th', d('the 9th', MON), ['exact', '2026-10-09']);
eq('the 4th next month', d('the 4th', MON), ['assumed', '2026-11-04']);
eq('year rollover friday', d('Friday', DEC30), ['exact', '2027-01-01']);
eq('leap day', d('February 29', MAR27), ['assumed', '2028-02-29']);
eq('invalid date', d('February 30', MON), ['unresolved', []]);

// Times (9-19 business)
const H = { openClose: { open: '09:00', close: '19:00' } };
const t = (p: string, c: any = H) => { const r = resolveTime(p, c); return [r.confidence, r.time ?? r.window?.label ?? r.candidates]; };
eq('bare 3', t('3'), ['assumed', '15:00']);
eq('around three', t('around three'), ['approximate', '15:00']);
eq('at 10', t('at 10'), ['assumed', '10:00']);
eq('at 7 outside hours', resolveTime('at 7', H).outsideHours, true);
eq('3:30 pm', t('3:30 pm'), ['exact', '15:30']);
eq('half past two', t('half past two'), ['assumed', '14:30']);
eq('quarter to four', t('quarter to four'), ['assumed', '15:45']);
eq('noon', t('noon'), ['exact', '12:00']);
eq('9 in the morning', t('9 in the morning'), ['exact', '09:00']);
eq('three thirty', t('three thirty'), ['assumed', '15:30']);
eq('afternoon window', t('afternoon'), ['window', 'afternoon']);
eq('morning window', t('tomorrow morning'), ['window', 'morning']);
eq('first thing', t('first thing'), ['assumed', '09:00']);
eq('after work', t('after work'), ['window', 'after work']);
eq('friday afternoon around 3', t('friday afternoon around 3'), ['approximate', '15:00']);
// Restaurant 17:00-24:00
const B = { openClose: { open: '17:00', close: '24:00' } };
eq('bistro at 7', t('at 7', B), ['assumed', '19:00']);
eq('bistro ten oclock', t("ten o'clock", B), ['assumed', '22:00']);
eq('bistro at 11', t('at 11', B), ['assumed', '23:00']);
// Combined: date numbers must not be read as times
const w = resolveWhen('October 9 at 3pm', { timezone: TZ, now: MON, ...H });
eq('combined date', w.date.date, '2026-10-09'); eq('combined time', w.time.time, '15:00');
const w2 = resolveWhen('friday around three', { timezone: TZ, now: MON, ...H });
eq('friday+three date', w2.date.date, '2026-10-09'); eq('friday+three time', w2.time.time, '15:00');
const w3 = resolveWhen('in 2 weeks', { timezone: TZ, now: MON, ...H });
eq('in 2 weeks has no time', w3.time.confidence, 'unresolved');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
