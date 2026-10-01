export type TemporalPrecision = 'EXACT' | 'APPROXIMATE' | 'RANGE' | 'UNKNOWN';

export interface TemporalRequest {
  dateExpr?: string; // "tomorrow", "Friday", "Oct 2"
  timeExpr?: string; // "14:00", "2 PM"
  timeRange?: {
    start: string;
    end: string;
    label: 'MORNING' | 'AFTERNOON' | 'EVENING';
  };
  precision: TemporalPrecision;
  isAmbiguous: boolean;
  clarificationPrompt?: string;
  originalText: string;
}

export class TemporalParser {
  public static parse(text: string): TemporalRequest {
    const lower = text.toLowerCase().trim();
    let precision: TemporalPrecision = 'UNKNOWN';
    let isAmbiguous = false;
    let clarificationPrompt: string | undefined;

    let dateExpr: string | undefined;
    let timeExpr: string | undefined;
    let timeRange: TemporalRequest['timeRange'] | undefined;

    // 1. Date Expressions
    if (lower.includes('tomorrow')) {
      dateExpr = 'tomorrow';
      precision = 'EXACT';
    } else if (lower.includes('today')) {
      dateExpr = 'today';
      precision = 'EXACT';
    } else {
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      for (const d of days) {
        if (lower.includes(`next ${d}`)) {
          dateExpr = `next ${d}`;
          precision = 'EXACT';
          isAmbiguous = true;
          clarificationPrompt = `Just to confirm, did you mean coming ${d} or next week?`;
          break;
        } else if (lower.includes(d)) {
          dateExpr = d;
          precision = 'EXACT';
          break;
        }
      }
    }

    // 2. Time Range Expressions (Morning, Afternoon, Evening)
    if (lower.includes('morning')) {
      timeRange = { start: '09:00', end: '12:00', label: 'MORNING' };
      precision = 'RANGE';
    } else if (lower.includes('afternoon')) {
      timeRange = { start: '13:00', end: '17:00', label: 'AFTERNOON' };
      precision = 'RANGE';
    } else if (lower.includes('evening')) {
      timeRange = { start: '17:00', end: '20:00', label: 'EVENING' };
      precision = 'RANGE';
    }

    // 3. Exact vs Approximate Time
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))\b/i);
    if (timeMatch) {
      timeExpr = timeMatch[1].toLowerCase();
      precision = lower.includes('around') || lower.includes('about') ? 'APPROXIMATE' : 'EXACT';
    } else {
      const bareMatch = text.match(/\b(?:at|around|about|for)\s+(\d{1,2})\b/i);
      if (bareMatch) {
        timeExpr = bareMatch[1];
        precision = 'APPROXIMATE';
      }
    }

    return {
      dateExpr,
      timeExpr,
      timeRange,
      precision,
      isAmbiguous,
      clarificationPrompt,
      originalText: text,
    };
  }
}
