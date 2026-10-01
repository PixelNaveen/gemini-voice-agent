export * from '../entities';

import {
  ConversationEntities,
  createEntity,
  updateEntityValue,
  rejectEntity,
  NormalizedDate,
  NormalizedTime,
} from '../entities';
import { DateTimeNormalizer } from '../entities/DateTimeNormalizer';
import { EmailNormalizer } from '../entities/EmailNormalizer';
import { extractCallerName } from '../entities/NameExtraction';
import { DependencyResolver } from '../entities/DependencyResolver';

/**
 * Enhanced Entity Extraction Pipeline with Normalization, Confidence Scoring, and Dependency Invalidation.
 */
export function extractEntitiesFromText(
  text: string,
  existing: ConversationEntities = {}
): { updated: ConversationEntities; corrections: string[]; invalidations: string[] } {
  const updated: ConversationEntities = { ...existing };
  const corrections: string[] = [];
  const lower = text.toLowerCase().trim();

  // 1. Spoken Rejections (e.g., "no that's not my email", "no, wrong date")
  if (lower.includes('not my email') || lower.includes('wrong email')) {
    if (updated.email) {
      updated.email = rejectEntity(updated.email);
      corrections.push('email rejected by user');
    }
  }

  // 2. Email Normalization & Validation
  const emailResult = EmailNormalizer.normalize(text);
  if (emailResult && emailResult.isValid) {
    if (updated.email && updated.email.value.toLowerCase() !== emailResult.email.toLowerCase()) {
      corrections.push(`email: ${updated.email.value} -> ${emailResult.email}`);
    }
    updated.email = updateEntityValue(
      updated.email,
      emailResult.email,
      emailResult.confidence,
      emailResult.needsSpellingConfirmation ? 'TENTATIVE' : 'CONFIRMED',
      'USER',
      text
    );
  }

  // 3. Caller Name Extraction
  // Shared with the session-fact extractor so a booking and the structured memory can never
  // disagree about who the caller is. This used to be a local regex that captured the next one or
  // two words unconditionally, which filed callers under "looking for" and "tomorrow".
  const extractedName = extractCallerName(text);
  if (extractedName) {
    const rawName = extractedName.value;
    if (updated.customerName && updated.customerName.value.toLowerCase() !== rawName.toLowerCase()) {
      corrections.push(`customerName: ${updated.customerName.value} -> ${rawName}`);
    }
    updated.customerName = updateEntityValue(
      updated.customerName,
      rawName,
      0.95,
      'CONFIRMED',
      'USER',
      extractedName.matchedText
    );
  }

  // 4. Deterministic Date Normalization
  const isCorrection = lower.includes('actually') || lower.includes('instead') || lower.includes('rather');
  const normalizedDate = DateTimeNormalizer.normalizeDate(text);
  if (normalizedDate) {
    if (updated.date && updated.date.value.iso !== normalizedDate.iso) {
      corrections.push(`date: ${updated.date.value.display} -> ${normalizedDate.display}`);
    }
    updated.date = updateEntityValue(
      updated.date,
      normalizedDate,
      0.96,
      isCorrection ? 'CONFIRMED' : 'TENTATIVE',
      'USER',
      text
    );
  }

  // 5. Deterministic Time Normalization
  const normalizedTime = DateTimeNormalizer.normalizeTime(text);
  if (normalizedTime) {
    if (updated.time && updated.time.value.time24 !== normalizedTime.time24) {
      corrections.push(`time: ${updated.time.value.display} -> ${normalizedTime.display}`);
    }
    updated.time = updateEntityValue(
      updated.time,
      normalizedTime,
      0.95,
      normalizedTime.isApproximate ? 'TENTATIVE' : 'CONFIRMED',
      'USER',
      text
    );
  }

  // 6. Time Range (Morning / Afternoon / Evening)
  if (lower.includes('morning')) {
    updated.timeRange = createEntity('MORNING', 0.9, 'TENTATIVE', 'USER', 'morning');
  } else if (lower.includes('afternoon')) {
    updated.timeRange = createEntity('AFTERNOON', 0.9, 'TENTATIVE', 'USER', 'afternoon');
  } else if (lower.includes('evening')) {
    updated.timeRange = createEntity('EVENING', 0.9, 'TENTATIVE', 'USER', 'evening');
  }

  // 7. Known Services
  const knownServices = [
    'haircut', 'blowout', 'balayage', 'highlights', 'color', 'facial', 'hydrafacial', 'manicure', 'pedicure', 'massage', 'beard trim',
    'oil change', 'synthetic oil', 'brake', 'brakes', 'alignment', 'tune-up', 'tire puncture', 'flat tire', 'patch', 'battery',
    'dental cleaning', 'cleaning', 'exam', 'toothache', 'filling', 'root canal', 'crown', 'whitening', 'invisalign',
    'tour', 'showing', 'valuation', 'appraisal', 'rental application',
    'consultation', 'llc formation', 'contract review', 'estate planning',
    'table reservation', 'dinner reservation', 'tasting menu',
    'ac repair', 'plumbing', 'burst pipe', 'drain cleaning', 'water heater', 'furnace'
  ];

  for (const s of knownServices) {
    if (lower.includes(s)) {
      const formatted = s.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (updated.service && updated.service.value.toLowerCase() !== s) {
        corrections.push(`service: ${updated.service.value} -> ${formatted}`);
      }
      updated.service = updateEntityValue(
        updated.service,
        formatted,
        0.95,
        'CONFIRMED',
        'USER',
        s
      );
      break;
    }
  }

  // 8. Party Size (Restaurants & Groups)
  const partyMatch = text.match(/(?:table for|party of|for)\s+(\d{1,2})\b/i);
  if (partyMatch) {
    const size = parseInt(partyMatch[1], 10);
    if (!isNaN(size)) {
      updated.partySize = createEntity(size, 0.95, 'CONFIRMED', 'USER', partyMatch[0]);
    }
  }

  // 9. Dependency Invalidation Check
  const invalidationResults = DependencyResolver.checkInvalidations(existing, updated);
  const invalidations = invalidationResults.map((r) => r.reason);

  return { updated, corrections, invalidations };
}
