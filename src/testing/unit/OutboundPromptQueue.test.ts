import { TestHarness, TestResult } from '../TestHarness';
import { OutboundPromptQueue } from '../../core/recovery/OutboundPromptQueue';

/**
 * F-11/F-35 support: a typed turn must survive the transport that was supposed to carry it.
 *
 * The bug this pins: when the UI was in `RECONNECTING`, `sendTextPrompt` logged
 * `[Outbound] Dropped text prompt: transport is not accepting turns.` and discarded the text.
 * Recovery then succeeded and the agent said nothing, so a caller who had asked a real question
 * mid-blip was left looking at their own unanswered message with no indication it had been
 * refused. From the caller's side the failure was indistinguishable from the agent going deaf.
 *
 * Freezing is still correct - sending into a dying socket both loses the turn and corrupts
 * provider turn state. The queue is what makes freezing safe, and these tests pin the properties
 * that keep the fix from becoming a new problem: bounded under a long outage, expired rather than
 * replayed as a stale turn, cleared across a session boundary, and delivered in order exactly
 * once.
 */

const SUITE = 'OutboundPromptQueue';

export async function runOutboundPromptQueueTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(
    await TestHarness.runTest(SUITE, 'a prompt typed during recovery is delivered, not dropped', () => {
      const queue = new OutboundPromptQueue();

      const queued = queue.enqueue('Can I book a haircut tomorrow?', 'conn_1');
      TestHarness.assert(queued !== null, 'a non-empty prompt must be accepted for later delivery');
      TestHarness.assertEqual(queue.size, 1, 'the prompt is held, not sent');

      const { deliver, expired, evicted } = queue.drain();
      TestHarness.assertEqual(deliver.length, 1, 'the held prompt must be delivered on drain');
      TestHarness.assertEqual(
        deliver[0].text,
        'Can I book a haircut tomorrow?',
        'the caller must get their own words back, not a paraphrase'
      );
      TestHarness.assertEqual(expired.length, 0, 'a fresh prompt must not be treated as stale');
      TestHarness.assertEqual(evicted.length, 0, 'nothing should be evicted from a queue of one');
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'the queue is empty again after a drain', () => {
      const queue = new OutboundPromptQueue();
      queue.enqueue('first');
      queue.drain();

      TestHarness.assertEqual(queue.size, 0, 'a drained queue must not re-deliver on the next drain');
      TestHarness.assertEqual(queue.drain().deliver.length, 0, 'a second drain must deliver nothing');
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'prompts are delivered oldest first, exactly once', () => {
      const queue = new OutboundPromptQueue();
      queue.enqueue('one');
      queue.enqueue('two');
      queue.enqueue('three');

      const { deliver } = queue.drain();
      TestHarness.assertEqual(deliver.length, 3, 'all three prompts survive a short outage');
      TestHarness.assertEqual(deliver[0].text, 'one', 'conversation order must be preserved');
      TestHarness.assertEqual(deliver[1].text, 'two', 'conversation order must be preserved');
      TestHarness.assertEqual(deliver[2].text, 'three', 'conversation order must be preserved');
      TestHarness.assertEqual(
        new Set(deliver.map((d) => d.id)).size,
        3,
        'each prompt must have a distinct id so a log line can be tied back to it'
      );
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'a prompt past its TTL is discarded rather than replayed stale', () => {
      let clock = 1_000;
      const queue = new OutboundPromptQueue({ ttlMs: 30_000, now: () => clock });

      queue.enqueue('asked before the long outage');
      clock += 45_000;

      const { deliver, expired } = queue.drain();
      TestHarness.assertEqual(deliver.length, 0, 'a question from 45s ago is not what the caller is waiting for');
      TestHarness.assertEqual(expired.length, 1, 'the stale prompt must be reported, not silently dropped');
      TestHarness.assertEqual(
        expired[0].text,
        'asked before the long outage',
        'the discarded prompt is identified so the loss is visible in the log'
      );
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'a prompt still inside its TTL survives the outage', () => {
      let clock = 1_000;
      const queue = new OutboundPromptQueue({ ttlMs: 30_000, now: () => clock });

      queue.enqueue('still relevant');
      clock += 10_000;

      TestHarness.assertEqual(queue.pending(), 1, 'a ten-second-old prompt is still pending');
      TestHarness.assertEqual(queue.drain().deliver.length, 1, 'it must be delivered');
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'a long outage cannot grow the queue without bound', () => {
      const queue = new OutboundPromptQueue({ maxEntries: 4, maxChars: 10_000 });

      for (let i = 0; i < 50; i += 1) queue.enqueue(`prompt ${i}`);

      TestHarness.assertEqual(
        queue.size,
        4,
        'entry count must stay capped no matter how long the outage runs'
      );

      const { deliver } = queue.drain();
      TestHarness.assertEqual(deliver.length, 4, 'the caller never receives a burst of stale turns');
      TestHarness.assertEqual(
        deliver[deliver.length - 1].text,
        'prompt 49',
        'the newest prompt is never the one evicted; it is the one still being waited on'
      );
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'the character cap bounds the queue independently of entry count', () => {
      const queue = new OutboundPromptQueue({ maxEntries: 100, maxChars: 50 });

      queue.enqueue('x'.repeat(40));
      queue.enqueue('y'.repeat(40));

      TestHarness.assert(
        queue.totalChars <= 50,
        `total held characters must respect the cap (was ${queue.totalChars}); a caller-supplied string is an unbounded input`
      );
      TestHarness.assert(
        queue.size < 2,
        'the character cap must evict even though the entry cap of 100 was never reached'
      );
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'the newest prompt is preserved even under eviction pressure', () => {
      const queue = new OutboundPromptQueue({ maxEntries: 3, maxChars: 10_000 });

      queue.enqueue('oldest and least relevant');
      queue.enqueue('middle');
      queue.enqueue('newest');
      queue.enqueue('newest of all');

      const { deliver } = queue.drain();
      TestHarness.assertEqual(deliver.length, 3, 'the cap holds');
      TestHarness.assertEqual(
        deliver[deliver.length - 1].text,
        'newest of all',
        'the prompt the caller just typed must never be the one discarded'
      );
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'a persona switch discards prompts from the previous call', () => {
      const queue = new OutboundPromptQueue();
      queue.enqueue('my name is Dana and I need a refill');
      queue.clear();

      TestHarness.assertEqual(queue.size, 0, 'a hard reset must not carry typed turns forward');
      TestHarness.assertEqual(
        queue.drain().deliver.length,
        0,
        "one business's caller detail must never surface in another persona's session"
      );
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'an empty or whitespace prompt is refused outright', () => {
      const queue = new OutboundPromptQueue();

      TestHarness.assertEqual(queue.enqueue(''), null, 'an empty prompt is not worth holding');
      TestHarness.assertEqual(queue.enqueue('   '), null, 'whitespace is not a turn');
      TestHarness.assertEqual(queue.size, 0, 'nothing may be queued from an empty send');
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'a prompt larger than the whole cap is still accepted alone', () => {
      const queue = new OutboundPromptQueue({ maxEntries: 8, maxChars: 20 });

      // The evictor stops at the protected entry rather than looping forever, so a single
      // oversized prompt is still delivered instead of throwing or silently vanishing.
      const queued = queue.enqueue('z'.repeat(200));
      TestHarness.assert(queued !== null, 'an oversized prompt must still be held');
      TestHarness.assertEqual(queue.size, 1, 'it occupies the queue alone');
      TestHarness.assertEqual(queue.drain().deliver.length, 1, 'it is delivered');
    })
  );

  results.push(
    await TestHarness.runTest(SUITE, 'the connection a prompt was typed against is retained for the log', () => {
      const queue = new OutboundPromptQueue();
      queue.enqueue('hello', 'conn_7');

      TestHarness.assertEqual(
        queue.drain().deliver[0].connectionId,
        'conn_7',
        'a flush log must be able to name the connection the prompt was waiting on'
      );
    })
  );

  return results;
}
