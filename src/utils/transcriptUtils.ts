import { TranscriptItem } from '../types';

/**
 * Sanitizes input text to ensure clean English prose without foreign characters or non-English script artifacts.
 *
 * Casing is preserved on purpose. The result is both what the user reads on screen and
 * what gets compared against Proper-Case persona data downstream, so folding case here
 * would destroy information no later stage could recover.
 */
export function sanitizeEnglishText(text: string): string {
  if (!text) return '';

  // Fold diacritics onto their base letters ("Müller" -> "Muller") before the script
  // filter, otherwise the combining marks read as "Inherited" and are deleted outright.
  let cleaned = text.normalize('NFD').replace(/\p{Mn}/gu, '');

  // Remove non-Latin foreign scripts (Asian CJK, Cyrillic, Arabic, Devnagari, emoji, …).
  // Matching on script rather than "not ASCII" keeps accented and stroked Latin letters
  // intact; deleting them mangled surnames past the point of recognition, and deleting
  // typographic punctuation welded neighbouring words together ("9–11" became "911").
  cleaned = cleaned.replace(/[^\p{Script=Latin}\p{N}\p{P}\p{Zs}]/gu, '');

  // Remove repeated duplicate filler tokens like "uhm uhm uhm uhm" if repeated 3+ times
  cleaned = cleaned.replace(/\b(\w+)(?:\s+\1){3,}\b/gi, '$1');

  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

// Streaming transcripts re-send the same turn with drifting case between partials
// ("i'd like" -> "I'd like"), so every equality/prefix/suffix test folds case at
// comparison time while the text that gets stored keeps the casing the speaker used.
const equalsIgnoringCase = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const startsWithIgnoringCase = (a: string, b: string): boolean => a.toLowerCase().startsWith(b.toLowerCase());
const endsWithIgnoringCase = (a: string, b: string): boolean => a.toLowerCase().endsWith(b.toLowerCase());

/**
 * Merges partial streaming transcripts or avoids adding duplicate items in chronological history.
 */
export function processTranscriptTurn(
  currentHistory: TranscriptItem[],
  speaker: 'user' | 'agent',
  text: string
): TranscriptItem[] {
  const sanitized = sanitizeEnglishText(text);
  if (!sanitized) return currentHistory;

  const now = new Date();
  const timestampStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const rawTime = now.getTime();

  const newHistory = [...currentHistory];
  const lastIndex = newHistory.length - 1;
  const lastItem = lastIndex >= 0 ? newHistory[lastIndex] : null;

  // If the last item is from the same speaker and was created within 5 seconds, attempt smart merge or deduplication
  if (lastItem && lastItem.speaker === speaker && (rawTime - lastItem.rawTime) < 5000) {
    const prevText = lastItem.text.trim();

    // Exact match or contains: ignore duplicate
    if (equalsIgnoringCase(prevText, sanitized) || endsWithIgnoringCase(prevText, sanitized)) {
      return currentHistory;
    }

    // Incremental update (e.g. "Hello" -> "Hello, how can I help")
    if (startsWithIgnoringCase(sanitized, prevText)) {
      newHistory[lastIndex] = {
        ...lastItem,
        text: sanitized,
        timestamp: timestampStr,
        rawTime,
      };
      return newHistory;
    }

    // Partial overlap merge
    if (startsWithIgnoringCase(prevText, sanitized)) {
      return currentHistory; // Already has longer version
    }

    // Otherwise append with space if it reads like a continuation turn
    newHistory[lastIndex] = {
      ...lastItem,
      text: `${prevText} ${sanitized}`,
      timestamp: timestampStr,
      rawTime,
    };
    return newHistory;
  }

  // Prevent exact duplicate entry anywhere in the last 3 items
  const recentDuplicate = newHistory.slice(-3).some(
    (item) => item.speaker === speaker && equalsIgnoringCase(item.text.trim(), sanitized)
  );

  if (recentDuplicate) {
    return currentHistory;
  }

  // Add new chronological turn
  newHistory.push({
    id: `turn_${rawTime}_${Math.random().toString(36).substring(2, 7)}`,
    speaker,
    text: sanitized,
    timestamp: timestampStr,
    rawTime,
    isFinal: true,
  });

  return newHistory;
}

/**
 * Automatically extracts key caller entities (Name, Email, Booking Intent, Preferences) from conversation text.
 */
export function extractSessionFactsFromText(text: string): { category: 'fact' | 'preference' | 'summary'; content: string }[] {
  const extracted: { category: 'fact' | 'preference' | 'summary'; content: string }[] = [];
  if (!text || text.length < 3) return extracted;

  const lower = text.toLowerCase();

  // 1. Name Extraction ("my name is Viktor", "I'm Viktor", "this is Viktor", "call me Viktor")
  const nameMatch = text.match(/(?:my name is|i'm|i am|this is|call me)\s+([A-Za-z][A-Za-z]+(?:\s+[A-Za-z][A-Za-z]+)?)/i);
  if (nameMatch && nameMatch[1]) {
    const candidateName = nameMatch[1].trim();
    // Speech arrives in whatever casing the recogniser produced, so the stop list is
    // stored lowercase and matched case-insensitively. Compared as-is it only ever
    // excluded "Aura", never "aura", and stored the agent's own name as the caller's.
    const excludeList = ['aura', 'hello', 'hi', 'here', 'a', 'the', 'just', 'looking', 'interested', 'ready', 'calling', 'trying', 'fine', 'good'];
    if (!excludeList.includes(candidateName.toLowerCase())) {
      extracted.push({
        category: 'fact',
        content: `Caller Name: ${candidateName}`,
      });
    }
  }

  // 2. Email Extraction
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch && emailMatch[1]) {
    extracted.push({
      category: 'fact',
      content: `Caller Email: ${emailMatch[1]}`,
    });
  }

  // 3. Demo / Booking Intent Extraction
  if (lower.includes('demo') || lower.includes('book') || lower.includes('appointment') || lower.includes('schedule')) {
    extracted.push({
      category: 'summary',
      content: `Active Booking / Demo Inquiry: ${text.length > 80 ? text.slice(0, 80) + '...' : text}`,
    });
  }

  return extracted;
}
