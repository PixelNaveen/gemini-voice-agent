/**
 * One correct answer to "what did the caller just say their name is".
 *
 * This exists because two regexes were independently trying to do this job, and both were wrong
 * in the same way. Each matched a trigger phrase and then grabbed the next one or two words with
 * a character class like `[A-Za-z][A-Za-z]+`, under the `i` flag. That combination cannot
 * distinguish a name from the sentence around it, so a receptionist ended up recording:
 *
 *   "I am looking for a haircut"        -> customerName: "looking for"
 *   "This is urgent, I need help"       -> customerName: "urgent"
 *   "Call me tomorrow"                  -> customerName: "tomorrow"
 *   "I am interested in the deluxe..."  -> customerName: "interested in"
 *   "My name is Dana and I need..."     -> customerName: "Dana and"
 *
 * Those are not cosmetic errors. `customerName` is written into structured memory by the voice
 * hook and is the field a booking is filed under, so a real caller could end up with an
 * appointment on the name "looking for" - and the confirmations would repeat it back to them.
 *
 * The fix is two rules, both of which the old patterns lacked:
 *
 * 1. **Only an unambiguous trigger counts.** "My name is", "my name's", and "call me" are things a
 *    caller says when they are giving a name. "I am", "I'm", and "this is" are not: they open
 *    ordinary sentences far more often than they introduce a name, so they are not triggers at
 *    all. "My name is Dana" is already a complete, unambiguous way to give a name without them.
 * 2. **A name ends at the first word that is not part of one.** Rather than "take the next two
 *    words", the capture takes consecutive name-shaped tokens and stops at a conjunction or any
 *    other word that cannot be part of a name. This is what turns "Dana and" into "Dana" while
 *    still allowing the real multi-word names people have: "Mary Jane", "Jean-Luc", "van der Berg".
 *
 * Speech-to-text casing is unreliable, so the *trigger* is matched case-insensitively but the
 * *name* is not required to be capitalised. Casing is deliberately not a filter here, because
 * "my name is jean-luc" must still work; the trigger is what makes the capture safe.
 */

/**
 * Words that can never be part of a person's name in this position, and so end the capture.
 *
 * Conjunctions and pronouns are the important entries: they are what made the greedy two-word
 * capture produce "Dana and" and "interested in". The rest are conversational filler that a
 * caller will say immediately after their name.
 */
const NAME_TERMINATORS = new Set([
  // Conjunctions and connectives
  'and', 'but', 'or', 'so', 'then', 'also', 'plus', 'because', 'since', 'while', 'when',
  // Pronouns and determiners
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'she', 'they', 'it', 'this', 'that',
  'these', 'those', 'the', 'a', 'an', 'there', 'here',
  // Verbs and modals that follow a name in ordinary speech
  'need', 'needs', 'want', 'wants', 'would', 'will', 'can', 'could', 'should', 'am', 'is', 'are',
  'was', 'were', 'have', 'has', 'had', 'been', 'am', 'do', 'does', 'did', 'please', 'just',
  // Time words. Without these, "call me tomorrow" files the booking under "tomorrow".
  'today', 'tomorrow', 'tonight', 'morning', 'afternoon', 'evening', 'yesterday', 'monday',
  'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february',
  'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november',
  'december',
  // Conversational filler and states
  'looking', 'interested', 'calling', 'trying', 'wondering', 'hoping', 'ready', 'back', 'sorry',
  'thanks', 'thank', 'sure', 'fine', 'good', 'great', 'ok', 'okay', 'yes', 'no', 'not', 'very',
  'really', 'actually', 'definitely', 'probably', 'first', 'new', 'returning', 'returning',
  'urgent', 'asap', 'quickly', 'now', 'again', 'later', 'soon',
]);

/**
 * Names that are never the caller's. The agent's own name matters most: without this,
 * "this is Aura" or a caller echoing "Aura" would overwrite the agent with itself.
 */
const RESERVED_NAMES = new Set([
  'aura', 'assistant', 'agent', 'system', 'user', 'anonymous', 'unknown', 'none', 'null',
  'hello', 'hi', 'hey', 'goodbye', 'bye',
]);

/**
 * Unambiguous ways a caller volunteers a name. Matched case-insensitively.
 *
 * Note what is absent: "i am", "i'm", and "this is". They are excluded deliberately - see the
 * file header. "My name is" and "call me" cover the real cases without the false positives.
 */
const STRONG_TRIGGER =
  /\b(?:my name is|my name's|my name would be|name's|call me|this is [A-Z][a-z]+\s+speaking|ask for)\s+/i;

/**
 * A single name-shaped token: letters, plus the punctuation that genuinely occurs inside real
 * names (hyphens, apostrophes, and periods for initials and titles).
 */
const NAME_TOKEN = /^[A-Za-z][A-Za-z'’.-]*$/;

/** Longest run of tokens treated as one name. "Mary Jane Watson" fits; a whole sentence does not. */
const MAX_NAME_TOKENS = 3;

export interface ExtractedName {
  /** The name as spoken, trimmed and with internal spacing normalised. */
  value: string;
  /** The full matched phrase, for provenance in entity values. */
  matchedText: string;
}

/**
 * Returns the caller's name if this text contains an unambiguous one, or null if it does not.
 *
 * Null is the common case and is not a failure: most turns in a booking call contain no name, and
 * treating "no name here" as a reason to invent one is what produced "looking for".
 */
export function extractCallerName(text: string): ExtractedName | null {
  if (!text) return null;

  const triggerMatch = text.match(STRONG_TRIGGER);
  if (!triggerMatch || triggerMatch.index === undefined) return null;

  // Resume after the trigger so the trigger's own words can never be captured as the name.
  const rest = text.slice(triggerMatch.index + triggerMatch[0].length);
  if (!rest) return null;

  // Take only the leading run of name-shaped, non-terminating tokens. "Dana and I need" yields
  // "Dana" because "and" ends the run; "Mary Jane Watson" yields all three.
  const tokens: string[] = [];
  for (const rawToken of rest.split(/\s+/)) {
    if (tokens.length >= MAX_NAME_TOKENS) break;
    const token = rawToken.replace(/^[^\w'’-]+|[^\w'’-]+$/g, '');
    if (!token) break;
    if (!NAME_TOKEN.test(token)) break;
    if (NAME_TERMINATORS.has(token.toLowerCase())) break;
    tokens.push(token);
  }

  if (!tokens.length) return null;

  const value = tokens.join(' ').replace(/\s+/g, ' ').trim();
  if (!value || value.length < 2) return null;
  if (RESERVED_NAMES.has(value.toLowerCase())) return null;

  // A single lowercase filler word is far more likely to be sentence furniture than a name, and
  // allowing it is how "tomorrow" got in. Two or more tokens, or an explicitly capitalised single
  // token, are treated as a real name.
  if (tokens.length === 1 && value.length < 3) return null;

  return { value, matchedText: text };
}

/**
 * True when a captured value looks like a real name rather than a stray word.
 *
 * Exposed so the session-fact extractor can apply the same judgement the entity extractor makes.
 */
export function isPlausibleCallerName(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  if (RESERVED_NAMES.has(trimmed.toLowerCase())) return false;
  if (NAME_TERMINATORS.has(trimmed.toLowerCase())) return false;
  // A number or a currency amount is never a name.
  if (/\d/.test(trimmed)) return false;
  return trimmed.split(/\s+/).every((t) => NAME_TOKEN.test(t));
}
