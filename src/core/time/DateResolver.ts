/**
 * DETERMINISTIC DATE / TIME RESOLVER
 * The LLM never calculates dates. It passes the caller's raw phrase ("next friday", "around three")
 * to this module and speaks the result. All math is done on YYYY-MM-DD strings in UTC so DST,
 * server timezone and year/month rollover cannot corrupt a date. "Now" is read in the BUSINESS timezone.
 *
 * Week model: Monday-Sunday (business convention).
 */
export type DateConfidence = 'exact' | 'assumed' | 'ambiguous' | 'unresolved';

export interface DateContext {
  timezone: string;
  now?: Date;
  /** How to treat "next <weekday>" when the coming one is still in the current week. */
  nextWeekdayPolicy?: 'ask' | 'upcoming' | 'following_week';
}
export interface ResolvedDate {
  confidence: DateConfidence;
  date?: string;
  candidates: string[];
  range?: { start: string; end: string };
  weekday?: string;
  spoken?: string;
  needsConfirmation: boolean;
  reason: string;
}

export type TimeConfidence = 'exact' | 'assumed' | 'approximate' | 'window' | 'ambiguous' | 'unresolved';
export interface TimeContext { openClose?: { open: string; close: string } }
export interface ResolvedTime {
  confidence: TimeConfidence;
  time?: string; // HH:MM 24h
  spoken?: string;
  candidates: string[];
  window?: { start: string; end: string; label: string };
  approximate: boolean;
  outsideHours?: boolean;
  needsConfirmation: boolean;
  reason: string;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD_MAP: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, weds: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const WD = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tues|thurs|thur|weds|sun|mon|tue|wed|thu|fri|sat)';
const MON = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
const HOURW = '(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';

// ---------- date arithmetic on YYYY-MM-DD ----------
const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toStr = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (s: string, n: number) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return toStr(d); };
export const weekdayOf = (s: string) => toDate(s).getUTCDay();
const weekStart = (s: string) => addDays(s, -((weekdayOf(s) + 6) % 7));
const nextOnOrAfter = (from: string, wd: number) => addDays(from, (wd - weekdayOf(from) + 7) % 7);
const isValid = (y: number, m: number, d: number) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; };
const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
export const speakDate = (s: string) => { const [, m, d] = s.split('-').map(Number); return `${WEEKDAY_NAMES[weekdayOf(s)]}, ${MONTH_NAMES[m - 1]} ${ordinal(d)}`; };
const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = (t: number) => `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`;
export const speakTime = (t: string) => { const [h, m] = t.split(':').map(Number); const ap = h >= 12 && h < 24 ? 'PM' : 'AM'; const h12 = h % 12 === 0 ? 12 : h % 12; return m === 0 ? `${h12} ${ap}` : `${h12}:${pad(m)} ${ap}`; };

export function localNow(timezone: string, at: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: (Number(g('hour')) % 24) * 60 + Number(g('minute')) };
}

const normalize = (s: string) => (s || '').toLowerCase().replace(/[’']/g, "'").replace(/[,.!?]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- DATE ----------
export function resolveDate(input: string, ctx: DateContext): ResolvedDate {
  const text = normalize(input);
  const today = localNow(ctx.timezone, ctx.now).date;
  const todayWd = weekdayOf(today);
  const policy = ctx.nextWeekdayPolicy ?? 'ask';

  const done = (confidence: DateConfidence, date: string | undefined, reason: string, o: Partial<ResolvedDate> = {}): ResolvedDate => ({
    confidence, date, candidates: o.candidates ?? (date ? [date] : []), range: o.range,
    weekday: date ? WEEKDAY_NAMES[weekdayOf(date)] : undefined, spoken: date ? speakDate(date) : undefined,
    needsConfirmation: o.needsConfirmation ?? (confidence !== 'exact'), reason,
  });
  const choose = (cands: string[], reason: string) => done('ambiguous', undefined, reason, { candidates: cands, needsConfirmation: true });

  let m: RegExpMatchArray | null;

  if (/\bday after tomorrow\b/.test(text)) return done('exact', addDays(today, 2), 'day after tomorrow');
  if (/\btomorrow\b/.test(text)) return done('exact', addDays(today, 1), 'tomorrow');
  if (/\b(today|tonight|later today|this (morning|afternoon|evening))\b/.test(text)) return done('exact', today, 'today');

  // "in N days/weeks"
  m = text.match(/\bin (?:(a couple of|couple of)|(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)) (day|days|week|weeks)\b/);
  if (m) {
    const n = m[1] ? 2 : (/^\d+$/.test(m[2]) ? Number(m[2]) : NUM_WORDS[m[2]]);
    const weeks = m[3].startsWith('week');
    return done(weeks || m[1] ? 'assumed' : 'exact', addDays(today, weeks ? n * 7 : n), `in ${n} ${m[3]}`, { needsConfirmation: weeks || !!m[1] });
  }

  // "a week from today / tomorrow / friday"
  m = text.match(new RegExp(`\\b(?:a )?week from (today|tomorrow|${WD})\\b`));
  if (m) {
    const base = m[1] === 'today' ? today : m[1] === 'tomorrow' ? addDays(today, 1) : nextOnOrAfter(today, WD_MAP[m[1]]);
    return done('exact', addDays(base, 7), `a week from ${m[1]}`);
  }

  // weekend
  if (/\bweekend\b/.test(text)) {
    if (/\bnext weekend\b/.test(text)) {
      const sat = addDays(weekStart(today), 12);
      return choose([sat, addDays(sat, 1)], 'next weekend: ask Saturday or Sunday');
    }
    if (todayWd === 0) return done('assumed', today, 'it is Sunday; weekend is today');
    const sat = nextOnOrAfter(today, 6);
    return choose([sat, addDays(sat, 1)], 'this weekend: ask Saturday or Sunday');
  }

  // "<weekday> (of) next week" / "next week <weekday>"
  m = text.match(new RegExp(`\\b${WD}\\b\\s*(?:of|in)?\\s*next week\\b`)) || text.match(new RegExp(`\\bnext week\\s+${WD}\\b`));
  if (m) return done('exact', addDays(weekStart(today), 7 + ((WD_MAP[m[1]] + 6) % 7)), 'weekday of next calendar week');

  // "<weekday> (of) this week"
  m = text.match(new RegExp(`\\b${WD}\\b\\s*(?:of|in)?\\s*this week\\b`));
  if (m) {
    const d = addDays(weekStart(today), (WD_MAP[m[1]] + 6) % 7);
    return d < today ? done('unresolved', undefined, 'that day already passed this week', { needsConfirmation: true }) : done('exact', d, 'weekday of this calendar week');
  }

  // generic weekday with optional modifier
  m = text.match(new RegExp(`\\b(?:(this|next|coming|upcoming|last|following)\\s+)?${WD}\\b`));
  if (m) {
    const mod = m[1] ?? '';
    const wd = WD_MAP[m[2]];
    if (mod === 'last') return done('unresolved', undefined, 'past date requested', { needsConfirmation: true });
    if (mod === 'next' || mod === 'following') {
      const A = nextOnOrAfter(addDays(today, 1), wd);
      if (weekStart(A) !== weekStart(today)) return done('exact', A, '"next" weekday that already falls in next week');
      if (policy === 'upcoming') return done('assumed', A, 'next = coming occurrence (policy)');
      if (policy === 'following_week') return done('assumed', addDays(A, 7), 'next = following week (policy)');
      return choose([A, addDays(A, 7)], `"next ${WEEKDAY_NAMES[wd]}" is ambiguous: this week or next week`);
    }
    const A = nextOnOrAfter(today, wd);
    if (wd === todayWd) {
      return mod ? done('exact', today, 'that weekday is today')
        : done('assumed', today, 'weekday said is today', { candidates: [today, addDays(today, 7)], needsConfirmation: true });
    }
    if (mod === 'this' && weekStart(A) !== weekStart(today)) {
      return done('assumed', A, '"this" weekday already passed this week; using the coming one', { needsConfirmation: true });
    }
    return done('exact', A, 'coming occurrence of that weekday');
  }

  // "october 9th [2026]" / "9th of october"
  const yearFor = (mo: number, d: number, explicit?: number): ResolvedDate => {
    const y0 = Number(today.slice(0, 4));
    if (explicit) {
      if (!isValid(explicit, mo, d)) return done('unresolved', undefined, 'invalid calendar date');
      const s = `${explicit}-${pad(mo)}-${pad(d)}`;
      return s < today ? done('unresolved', undefined, 'date is in the past') : done('exact', s, 'explicit date');
    }
    for (let y = y0; y <= y0 + 8; y++) {
      if (!isValid(y, mo, d)) continue;
      const s = `${y}-${pad(mo)}-${pad(d)}`;
      if (s >= today) return y === y0 ? done('exact', s, 'date this year') : done('assumed', s, 'date already passed this year; using next valid year', { needsConfirmation: true });
    }
    return done('unresolved', undefined, 'invalid calendar date');
  };
  m = text.match(new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s+(\\d{4}))?`));
  if (m) return yearFor(MONTH_MAP[m[1]], Number(m[2]), m[3] ? Number(m[3]) : undefined);
  m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}\\b(?:\\s+(\\d{4}))?`));
  if (m) return yearFor(MONTH_MAP[m[2]], Number(m[1]), m[3] ? Number(m[3]) : undefined);
  m = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m) {
    let mo = Number(m[1]), d = Number(m[2]);
    const yr = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined;
    if (mo > 12 && d <= 12) { [mo, d] = [d, mo]; }
    return yearFor(mo, d, yr);
  }
  m = text.match(/\b(?:the )?(\d{1,2})(?:st|nd|rd|th)\b/);
  if (m) {
    const d = Number(m[1]);
    const [y0, mo0] = today.split('-').map(Number);
    for (let i = 0; i < 14; i++) {
      const y = y0 + Math.floor((mo0 - 1 + i) / 12), mo = ((mo0 - 1 + i) % 12) + 1;
      if (!isValid(y, mo, d)) continue;
      const s = `${y}-${pad(mo)}-${pad(d)}`;
      if (s >= today) return done(i === 0 ? 'exact' : 'assumed', s, 'day of month', { needsConfirmation: i !== 0 });
    }
  }

  if (/\bend of (?:the )?month\b/.test(text)) {
    const [y, mo] = today.split('-').map(Number);
    return done('assumed', toStr(new Date(Date.UTC(y, mo, 0))), 'end of month', { needsConfirmation: true });
  }
  if (/\bnext week\b/.test(text)) { const s = addDays(weekStart(today), 7); return done('ambiguous', undefined, 'next week: ask which day', { range: { start: s, end: addDays(s, 6) }, needsConfirmation: true }); }
  if (/\bthis week\b/.test(text)) return done('ambiguous', undefined, 'this week: ask which day', { range: { start: today, end: addDays(weekStart(today), 6) }, needsConfirmation: true });

  return done('unresolved', undefined, 'no date found', { needsConfirmation: true });
}

// ---------- TIME ----------
const DAYPARTS: { re: RegExp; label: string; start: string; end: string }[] = [
  { re: /\bafter work\b/, label: 'after work', start: '17:30', end: '20:00' },
  { re: /\b(lunch|lunchtime|midday hour)\b/, label: 'lunch', start: '12:00', end: '14:00' },
  { re: /\bmorning\b/, label: 'morning', start: '08:00', end: '12:00' },
  { re: /\bafternoon\b/, label: 'afternoon', start: '12:00', end: '17:00' },
  { re: /\b(evening|tonight)\b/, label: 'evening', start: '17:00', end: '21:00' },
];

function stripDateParts(t: string): string {
  return t
    .replace(new RegExp(`\\b${MON}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:\\s+\\d{4})?`, 'g'), ' ')
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}\\b(?:\\s+\\d{4})?`, 'g'), ' ')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, ' ')
    .replace(/\b(?:the )?\d{1,2}(?:st|nd|rd|th)\b/g, ' ')
    .replace(/\bin (?:a couple of|couple of|\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten) (?:day|days|week|weeks)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function wordsToDigits(t: string): string {
  const h = (w: string) => String(NUM_WORDS[w]);
  const MINW = '(fifteen|thirty|forty[- ]five|twenty|forty|fifty|oh[- ]five|ten)';
  const minVal = (w: string) => ({ fifteen: 15, thirty: 30, 'forty five': 45, 'forty-five': 45, twenty: 20, forty: 40, fifty: 50, 'oh five': 5, 'oh-five': 5, ten: 10 } as Record<string, number>)[w];
  return t
    .replace(new RegExp(`\\b${HOURW}\\s+${MINW}\\b`, 'g'), (_m, a, b) => `${h(a)}:${pad(minVal(b))}`)
    .replace(new RegExp(`\\b(half past|quarter past|quarter to)\\s+${HOURW}\\b`, 'g'), (_m, a, b) => `${a} ${h(b)}`)
    .replace(new RegExp(`\\b(at|around|about|by|before|after|until|@)\\s+${HOURW}\\b`, 'g'), (_m, a, b) => `${a} ${h(b)}`)
    .replace(new RegExp(`\\b${HOURW}\\s*(am|pm|a\\.m\\.|p\\.m\\.|o'clock|ish)`, 'g'), (_m, a, b) => `${h(a)} ${b}`)
    .replace(new RegExp(`^${HOURW}$`), (_m, a) => h(a));
}

export function resolveTime(input: string, ctx: TimeContext = {}): ResolvedTime {
  let text = wordsToDigits(stripDateParts(normalize(input)));
  const open = mins(ctx.openClose?.open ?? '07:00');
  const closeRaw = ctx.openClose?.close ?? '20:00';
  const close = closeRaw === '00:00' ? 1440 : mins(closeRaw);
  const fits = (t: number) => t >= open && t < close;
  const approximate = /\b(around|about|approximately|roughly|or so)\b|\d\s*ish\b|~/.test(text);
  const hint: 'am' | 'pm' | undefined = /\b(afternoon|evening|tonight|night)\b/.test(text) ? 'pm' : /\bmorning\b/.test(text) ? 'am' : undefined;

  const R = (confidence: TimeConfidence, t: number | undefined, reason: string, o: Partial<ResolvedTime> = {}): ResolvedTime => ({
    confidence, time: t === undefined ? undefined : hhmm(t), spoken: t === undefined ? undefined : speakTime(hhmm(t)),
    candidates: o.candidates ?? (t === undefined ? [] : [hhmm(t)]), window: o.window, approximate,
    outsideHours: o.outsideHours, needsConfirmation: o.needsConfirmation ?? (confidence !== 'exact'), reason,
  });

  const infer = (h: number, min: number, reason: string): ResolvedTime => {
    if (h === 0 || h > 12) return R(approximate ? 'approximate' : 'exact', h * 60 + min, '24-hour time');
    const cands = h === 12 ? [12 * 60 + min, min] : [h * 60 + min, (h + 12) * 60 + min];
    const pm = h === 12 ? cands[0] : cands[1];
    const am = h === 12 ? cands[1] : cands[0];
    if (hint === 'pm') return R(approximate ? 'approximate' : 'assumed', pm, `${reason}; daypart says PM`, { needsConfirmation: approximate });
    if (hint === 'am') return R(approximate ? 'approximate' : 'assumed', am, `${reason}; daypart says AM`, { needsConfirmation: approximate });
    const ok = cands.filter(fits);
    if (ok.length === 1) return R(approximate ? 'approximate' : 'assumed', ok[0], `${reason}; only one reading falls inside business hours`, { needsConfirmation: true });
    if (ok.length === 2) return R('ambiguous', undefined, `${reason}; AM or PM both possible`, { candidates: [hhmm(am), hhmm(pm)], needsConfirmation: true });
    return R('ambiguous', undefined, `${reason}; neither AM nor PM is inside business hours`, { candidates: [hhmm(am), hhmm(pm)], outsideHours: true, needsConfirmation: true });
  };

  let m: RegExpMatchArray | null;
  if (/\b(noon|midday)\b/.test(text) && !/lunch/.test(text)) return R('exact', 720, 'noon');
  if (/\bmidnight\b/.test(text)) return R('exact', 0, 'midnight');

  m = text.match(/\b(half past|quarter past|quarter to)\s+(\d{1,2})\b/);
  if (m) {
    let h = Number(m[2]); let min = m[1] === 'half past' ? 30 : m[1] === 'quarter past' ? 15 : 45;
    if (m[1] === 'quarter to') h = h === 1 ? 12 : h - 1;
    return infer(h, min, m[1]);
  }
  m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b/);
  if (m) {
    let h = Number(m[1]); const min = Number(m[2] ?? 0);
    if (h < 1 || h > 12) return R('unresolved', undefined, 'invalid hour', { needsConfirmation: true });
    h = (h % 12) + (m[3] === 'p' ? 12 : 0);
    return R(approximate ? 'approximate' : 'exact', h * 60 + min, 'explicit AM/PM');
  }
  m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:in the |at )?(morning|afternoon|evening|night)\b/);
  if (m) {
    let h = Number(m[1]); const min = Number(m[2] ?? 0);
    const pm = m[3] !== 'morning';
    if (h >= 1 && h <= 12) { h = (h % 12) + (pm ? 12 : 0); return R(approximate ? 'approximate' : 'exact', h * 60 + min, 'hour plus daypart'); }
  }
  m = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) return infer(Number(m[1]), Number(m[2]), 'clock time without AM/PM');
  m = text.match(/\b(\d{1,2})\s*o'clock\b/) || text.match(/(?:\b(?:at|around|about|by|@)\s*)(\d{1,2})\b/) || text.match(/\b(\d{1,2})\s*ish\b/) || text.match(/^(\d{1,2})$/);
  if (m) { const h = Number(m[1]); if (h >= 0 && h <= 23) return infer(h, 0, 'bare hour'); }

  if (/\bfirst thing\b/.test(text)) return R('assumed', open, 'first thing = opening time', { needsConfirmation: true });
  if (/\bend of (?:the )?day\b/.test(text)) return R('window', undefined, 'end of day', { window: { start: hhmm(Math.max(open, close - 120)), end: hhmm(close % 1440), label: 'end of day' }, candidates: [], needsConfirmation: true });
  for (const d of DAYPARTS) {
    if (d.re.test(text)) return R('window', undefined, `daypart: ${d.label}`, { window: { start: d.start, end: d.end, label: d.label }, needsConfirmation: true });
  }
  return R('unresolved', undefined, 'no time found', { needsConfirmation: true });
}

/** Resolve a free-form "when" phrase such as "friday around three". */
export function resolveWhen(input: string, ctx: DateContext & TimeContext) {
  return { date: resolveDate(input, ctx), time: resolveTime(input, ctx) };
}
