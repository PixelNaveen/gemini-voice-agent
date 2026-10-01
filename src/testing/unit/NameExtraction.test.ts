import { TestHarness, TestResult } from '../TestHarness';
import { extractCallerName, isPlausibleCallerName } from '../../core/entities/NameExtraction';
import { extractEntitiesFromText } from '../../core/conversation/Entities';
import { extractSessionFactsFromText } from '../../utils/transcriptUtils';

/**
 * A receptionist that files a booking under the wrong name is worse than one that asks twice.
 *
 * The bug this pins: two independent regexes tried to spot "the caller just gave their name", and
 * each grabbed the one or two words following a trigger phrase. Because the character class was
 * `[A-Za-z]` under the `i` flag, nothing distinguished a name from ordinary sentence furniture, so
 * real utterances produced these customer names:
 *
 *   "I am looking for a haircut"       -> "looking for"
 *   "This is urgent, I need help"      -> "urgent"
 *   "Call me tomorrow"                 -> "tomorrow"
 *   "I am interested in the deluxe..." -> "interested in"
 *   "My name is Dana and I need..."    -> "Dana and"
 *
 * `customerName` is what the voice hook writes into structured memory and what a booking is filed
 * under, so those strings reached confirmation messages and, in the two-word cases, would have
 * been read aloud back to the caller as though they were a person's name.
 *
 * The fix restricts triggers to phrases a caller only uses when volunteering a name, and ends the
 * capture at the first word that cannot be part of one. These tests hold both halves of that in
 * place, plus the agreement between the two layers that previously disagreed.
 */

const SUITE = 'NameExtraction';

export async function runNameExtractionTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const realNames: Array<[string, string]> = [
    ['My name is Dana and I need a refill on my prescription', 'Dana'],
    ['My name is Mary Jane Watson', 'Mary Jane Watson'],
    ['my name is jean-luc picard', 'jean-luc picard'],
    ["My name is O'Brien", "O'Brien"],
    ['call me Dana', 'Dana'],
    ["my name's Viktor", 'Viktor'],
  ];

  for (const [text, expected] of realNames) {
    results.push(
      await TestHarness.runTest(SUITE, `a real name is captured from "${text.slice(0, 32)}..."`, () => {
        const result = extractCallerName(text);
        TestHarness.assert(result !== null, 'an unambiguous name must be captured');
        TestHarness.assertEqual(
          result!.value,
          expected,
          'the name must be exact, including genuine multi-word and hyphenated names'
        );
      })
    );
  }

  const notNames: Array<[string, string]> = [
    ['I am looking for a haircut', '"i am" is not a name trigger'],
    ['This is urgent, I need help', '"this is" is not a name trigger'],
    ['I am interested in the deluxe package', 'a following word is not a name'],
    ['Call me tomorrow', 'a day of the week is not a name'],
    ['I am a first time customer', 'an ordinary "i am" sentence is not a name'],
    ['This is Aura', "the agent's own name is never the caller's"],
    ['Can I book an appointment for tomorrow', 'no trigger, no name'],
    ['What are your hours', 'no trigger, no name'],
  ];

  for (const [text, why] of notNames) {
    results.push(
      await TestHarness.runTest(SUITE, `sentence furniture is not a name: "${text.slice(0, 32)}"`, () => {
        TestHarness.assertEqual(
          extractCallerName(text),
          null,
          `${why}; a wrong name here becomes the name on a real booking`
        );
      })
    );
  }

  results.push(
    await TestHarness.runTest(SUITE, 'a name is not carried past the end of the name', () => {
      // The exact case that produced "Dana and". The conjunction must terminate the capture.
      const result = extractCallerName('My name is Dana and I need a refill');
      TestHarness.assertEqual(result?.value, 'Dana', '"and" must end the capture, not join it');
      TestHarness.assert(
        !/\band\b/i.test(result?.value ?? ''),
        'a conjunction inside a name would be read back to the caller as their name'
      );
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'the two layers cannot disagree about who the caller is', () => {
      // Previously extractEntitiesFromText said "Dana and" while extractSessionFactsFromText said
      // something else, so structured memory and the session summary could record different
      // people for one call. They now read the same extractor.
      const text = 'My name is Mary Jane and I would like a haircut';
      const entityName = extractEntitiesFromText(text, {}).updated.customerName?.value;
      const facts = extractSessionFactsFromText(text);

      TestHarness.assertEqual(entityName, 'Mary Jane', 'the runtime entity must be the real name');
      TestHarness.assert(
        facts.some((f) => f.content === 'Caller Name: Mary Jane'),
        `the session fact must match the runtime entity exactly; got ${JSON.stringify(facts)}`
      );
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'no name fact is recorded for a turn that names no one', () => {
      const facts = extractSessionFactsFromText('I am looking for a haircut tomorrow');
      TestHarness.assert(
        !facts.some((f) => f.content.startsWith('Caller Name:')),
        'a booking-intent sentence must not contribute a caller name'
      );
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'implausible name values are rejected', () => {
      for (const bad of ['', 'a', 'and', 'tomorrow', 'aura', 'Dana 42', '3']) {
        TestHarness.assert(
          !isPlausibleCallerName(bad),
          `"${bad}" must not pass as a caller name`
        );
      }
      for (const good of ['Dana', 'Mary Jane', "O'Brien", 'jean-luc']) {
        TestHarness.assert(isPlausibleCallerName(good), `"${good}" must pass as a caller name`);
      }
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'empty and malformed input yields no name', () => {
      TestHarness.assertEqual(extractCallerName(''), null, 'empty text has no name');
      TestHarness.assertEqual(extractCallerName('   '), null, 'whitespace has no name');
      TestHarness.assertEqual(extractCallerName('my name is'), null, 'a trigger with no name is not a name');
      TestHarness.assertEqual(extractCallerName('my name is and'), null, 'a bare terminator is not a name');
    })
  );

  return results;
}
