import { TestHarness, TestResult } from '../TestHarness';
import {
  GeminiProjectPool,
  GeminiProjectConfig,
  GeminiProjectInstance,
} from '../../server/projects/GeminiProjectPool';
import { GoogleGenAI } from '@google/genai';
import http from 'http';
import type { AddressInfo } from 'net';

/**
 * These suites used to read the developer's real GEMINI_* environment variables through
 * the process-wide singleton. On any machine without credentials the pool registered zero
 * projects and all three tests failed, which made the suite non-reproducible and hid
 * genuine regressions behind environment noise.
 *
 * They now run against a fully injected, isolated cluster with a deterministic clock and
 * a stub client factory: no network, no credentials, identical results everywhere.
 */
const TEST_CONFIGS: GeminiProjectConfig[] = [
  {
    id: 'test-alpha',
    projectId: 'test-project-alpha',
    name: 'Test Cluster Alpha',
    apiKey: 'test-key-alpha',
    model: 'gemini-live-test',
    region: 'us-central1',
    enabled: true,
    capacity: 2,
  },
  {
    id: 'test-beta',
    projectId: 'test-project-beta',
    name: 'Test Cluster Beta',
    apiKey: 'test-key-beta',
    model: 'gemini-live-test',
    region: 'us-east4',
    enabled: true,
    capacity: 2,
  },
];

const stubClient = {} as GoogleGenAI;

function makePool(now?: () => number): GeminiProjectPool {
  return GeminiProjectPool.createIsolated({
    configs: TEST_CONFIGS,
    clientFactory: () => stubClient,
    now,
    log: () => {},
  });
}

export async function runGeminiProjectPoolTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 0: A cluster with no credentials is an explicit configuration error, not an
  // empty pool that fails on the first live call.
  results.push(
    await TestHarness.runTest('GeminiProjectPool', 'Reports an explicit configuration error when no credential is present', () => {
      const empty = GeminiProjectPool.createIsolated({ configs: [], log: () => {} });
      TestHarness.assert(!empty.hasUsableProject(), 'An empty cluster has no usable project');
      TestHarness.assert(
        Boolean(empty.getConfigurationError()),
        'A misconfigured cluster must expose a configuration error'
      );
      TestHarness.assertEqual(
        empty.acquire(),
        null,
        'A misconfigured cluster must refuse acquisition instead of returning a keyless project'
      );
      empty.dispose();
    })
  );

  // Test 1: Registers the multi-project cluster with isolated configurations.
  results.push(
    await TestHarness.runTest('GeminiProjectPool', 'Registers multi-project cluster with isolated configurations', () => {
      const pool = makePool();
      const cluster = pool.getClusterStatus();
      TestHarness.assertEqual(cluster.length, 2, 'Both configured projects must register');
      const primary = cluster[0];
      TestHarness.assertEqual(primary.id, 'test-alpha', 'Primary project must be the first configured project');
      TestHarness.assertEqual(primary.status, 'AVAILABLE', 'Initial project status must be AVAILABLE');
      TestHarness.assert(primary.healthScore >= 80, 'Initial health score must be high');
      TestHarness.assertEqual(pool.getConfigurationError(), null, 'A valid cluster reports no configuration error');
      pool.dispose();
    })
  );

  // Test 2: Dynamic health scoring penalizes 429 rate limit and marks cooldown.
  results.push(
    await TestHarness.runTest('GeminiProjectPool', 'Calculates dynamic health score and applies cooldown on 429', () => {
      let t = 1_700_000_000_000;
      const pool = makePool(() => t);
      const projects = pool.getAllProjects();
      TestHarness.assert(projects.length > 0, 'Projects must exist');
      const proj = projects[0];

      const initialScore = pool.calculateHealthScore(proj);
      TestHarness.assert(initialScore >= 80, 'Baseline score should be >= 80');

      // Record 429 quota exhaustion
      t += 1000;
      pool.markUnhealthy(proj.config.id, 'Resource exhausted quota 429', 429);

      const degradedScore = pool.calculateHealthScore(proj);
      TestHarness.assert(degradedScore < initialScore, 'Score must be reduced after 429');
      TestHarness.assertEqual(proj.status, 'COOLDOWN', 'Project must enter COOLDOWN status on 429');

      // The cooldown must actually expire on the injected clock, not linger forever.
      t += 11_000;
      pool.refreshProjectHealth(proj);
      TestHarness.assertEqual(proj.status, 'AVAILABLE', 'Cooldown must expire after its window');

      // Clear remaining error counters and confirm recovery.
      proj.metrics.cooldownUntil = null;
      proj.metrics.rateLimitCount = 0;
      pool.markHealthy(proj.config.id, 120);
      TestHarness.assertEqual(proj.status, 'AVAILABLE', 'Project recovers to AVAILABLE after health mark');
      pool.dispose();
    })
  );

  // Test 3: Optimal project selection prefers highest health score and avoids unhealthy nodes.
  results.push(
    await TestHarness.runTest('GeminiProjectPool', 'Acquires optimal project avoiding unhealthy nodes', () => {
      let t = 1_700_000_000_000;
      const pool = makePool(() => t);

      // Force alpha into cooldown so beta must be selected.
      t += 1000;
      pool.markUnhealthy('test-alpha', 'Resource exhausted quota 429', 429);
      TestHarness.assertEqual(pool.getProject('test-alpha')?.status, 'COOLDOWN', 'Alpha must be in cooldown');

      const acquired = pool.acquire();
      TestHarness.assert(Boolean(acquired), 'Must acquire an active project');
      TestHarness.assertEqual(acquired!.config.id, 'test-beta', 'Acquisition must avoid the cooling project');
      TestHarness.assert(acquired!.activeConnections > 0, 'Active connections must increment');

      // Release back to pool
      pool.release(acquired!.config.id);
      TestHarness.assertEqual(acquired!.activeConnections, 0, 'Release must return the slot');
      pool.dispose();
    })
  );

  // Test 4: Capacity limits and explicit preferences are honoured.
  results.push(
    await TestHarness.runTest('GeminiProjectPool', 'Honours capacity limits and explicit project preference', () => {
      const pool = makePool();
      const preferred = pool.acquire({ preferProjectId: 'test-beta' });
      TestHarness.assertEqual(preferred?.config.id, 'test-beta', 'An explicit healthy preference must be honoured');

      // Excluding a project must never return it.
      const excluded = pool.acquire({ excludeProjectIds: ['test-alpha', 'test-beta'] });
      TestHarness.assert(
        excluded === null || !['test-alpha', 'test-beta'].includes(excluded.config.id),
        'An excluded project must never be acquired'
      );

      // Fill alpha to capacity and confirm it stops being selected.
      const a = pool.getProject('test-alpha')!;
      a.activeConnections = a.config.capacity;
      pool.refreshProjectHealth(a);
      const picked = pool.acquire({ preferProjectId: 'test-alpha' });
      TestHarness.assert(
        picked?.config.id !== 'test-alpha',
        'A project at capacity must not be preferred'
      );
      pool.dispose();
    })
  );

  // Test 6: Gemini rate limits are enforced per Google Cloud project, not per API key. Two
  // keys from the same project share one bucket, so registering them separately would
  // multiply advertised capacity while the real ceiling stayed put, turning saturation
  // into 429s during live calls instead of a clean refusal at admission time.
  results.push(
    await TestHarness.runTest('GeminiProjectPool', 'Collapses duplicate keys that share one Google Cloud project', () => {
      const shared = 'test-key-shared-by-two-projects';
      const logs: string[] = [];
      const pool = GeminiProjectPool.createIsolated({
        configs: [
          { ...TEST_CONFIGS[0], id: 'dup-a', name: 'Project A', apiKey: shared },
          { ...TEST_CONFIGS[1], id: 'dup-b', name: 'Project B', apiKey: shared },
          { ...TEST_CONFIGS[1], id: 'real-b', name: 'Project C', apiKey: 'test-key-distinct' },
        ],
        clientFactory: () => stubClient,
        log: (m) => logs.push(m),
      });

      TestHarness.assertEqual(
        pool.getAllProjects().length,
        2,
        'Three projects sharing two distinct keys must register as two'
      );
      TestHarness.assert(
        logs.some((l) => l.includes('Collapse') || l.includes('Collapsing')),
        'The collapse must be logged so the misconfiguration is visible at boot'
      );
      pool.dispose();
    })
  );

  // Test 7: A single-key cluster must not advertise phantom capacity, and admission must
  // refuse once the real cap is reached rather than over-admitting into provider 429s.
  // An explicitly configured capacity must also be respected instead of being overwritten
  // by the environment default.
  results.push(
    await TestHarness.runTest('GeminiProjectPool', 'A single-key cluster admits only one project worth of sessions', () => {
      const explicit = GeminiProjectPool.createIsolated({
        configs: [{ ...TEST_CONFIGS[0], id: 'solo', apiKey: 'solo-key', capacity: 2 }],
        clientFactory: () => stubClient,
        log: () => {},
      });
      const [only] = explicit.getAllProjects();
      TestHarness.assertEqual(
        only.config.capacity,
        2,
        'An explicit capacity must not be overwritten by the environment default'
      );

      for (let i = 0; i < 2; i++) {
        TestHarness.assert(explicit.acquire() !== null, `Slot ${i + 1} must be within capacity`);
      }
      TestHarness.assertEqual(
        explicit.acquire(),
        null,
        'Admission must refuse once the single project is saturated'
      );
      explicit.dispose();

      // capacity 0 means "defer to the environment", which is what the shipped env-built
      // cluster uses so the operator's AURA_PROJECT_CAPACITY setting is honoured.
      const deferred = GeminiProjectPool.createIsolated({
        configs: [{ ...TEST_CONFIGS[0], id: 'deferred', apiKey: 'deferred-key', capacity: 0 }],
        clientFactory: () => stubClient,
        log: () => {},
      });
      const [fallback] = deferred.getAllProjects();
      TestHarness.assertEqual(
        fallback.config.capacity,
        4,
        'A capacity of 0 must fall back to the conservative default'
      );
      deferred.dispose();
    })
  );

  // Test 8: With two genuine quota buckets the pool must spread load across both rather than
  // filling the first project to its cap and only then reaching the second. Filling one key
  // first would concentrate the burst on a single rate-limit bucket and leave the other idle,
  // which defeats the reason for running multiple projects.
  results.push(
    await TestHarness.runTest('GeminiProjectPool', 'Spreads concurrent sessions across both quota buckets', () => {
      const pool = GeminiProjectPool.createIsolated({
        configs: [
          { ...TEST_CONFIGS[0], id: 'spread-a', apiKey: 'spread-key-a', capacity: 3 },
          { ...TEST_CONFIGS[1], id: 'spread-b', apiKey: 'spread-key-b', capacity: 3 },
        ],
        clientFactory: () => stubClient,
        log: () => {},
      });

      const held = [];
      for (let i = 0; i < 6; i++) {
        const slot = pool.acquireSlot();
        TestHarness.assert(slot !== null, `Slot ${i + 1} of 6 must be admitted`);
        if (slot) held.push(slot);
      }

      const counts = new Map<string, number>();
      for (const s of held) {
        const id = s.project.config.id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      TestHarness.assertEqual(counts.get('spread-a'), 3, 'First project must take its full share');
      TestHarness.assertEqual(counts.get('spread-b'), 3, 'Second project must take its full share');
      TestHarness.assertEqual(
        pool.acquireSlot(),
        null,
        'A seventh session must be refused once both buckets are full'
      );

      held.forEach((s) => s.release());
      TestHarness.assert(
        pool.getAllProjects().every((p) => p.activeConnections === 0),
        'Every slot must be released'
      );
      pool.dispose();
    })
  );

  // Test 9: The credential probe is what stops readiness reporting HEALTHY for a revoked key.
  // A key string being present is not a working credential, so the probe has to actually ask
  // the provider - and it has to say no when the answer is no.
  results.push(
    await TestHarness.runTest('GeminiProjectPool', 'The credential probe reports a rejected key as unusable', async () => {
      const previous = process.env.AURA_CREDENTIAL_PROBE_URL;
      let calls = 0;
      const stub = http.createServer((_req, res) => {
        calls++;
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'API key not valid' } }));
      });
      await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', () => resolve()));
      const { port } = stub.address() as AddressInfo;
      process.env.AURA_CREDENTIAL_PROBE_URL = `http://127.0.0.1:${port}/v1beta/models`;

      try {
        const pool = makePool();
        // The precondition that made the old readiness gate worthless: the pool looks healthy
        // on the strength of the key string alone.
        TestHarness.assert(
          pool.hasUsableProject(),
          'A configured key satisfies hasUsableProject, which is exactly why the probe is needed'
        );
        const rejected = await pool.verifyCredential();
        TestHarness.assertEqual(rejected, false, 'A rejected credential must not verify');

        // Cached: a readiness poll every few seconds must not become a request storm.
        TestHarness.assertEqual(calls, 1, 'The probe must hit the provider once');
        await pool.verifyCredential();
        TestHarness.assertEqual(calls, 1, 'A cached probe must not re-hit the provider');
        pool.dispose();
      } finally {
        if (previous === undefined) delete process.env.AURA_CREDENTIAL_PROBE_URL;
        else process.env.AURA_CREDENTIAL_PROBE_URL = previous;
        await new Promise<void>((resolve) => stub.close(() => resolve()));
      }
    })
  );

  // Test 10: An accepted credential must verify, and the cache must expire rather than
  // pinning a verdict forever - a key that was good an hour ago proves nothing now.
  results.push(
    await TestHarness.runTest('GeminiProjectPool', 'An accepted credential verifies and the cached verdict expires', async () => {
      const previous = process.env.AURA_CREDENTIAL_PROBE_URL;
      let calls = 0;
      const stub = http.createServer((_req, res) => {
        calls++;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ models: [] }));
      });
      await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', () => resolve()));
      const { port } = stub.address() as AddressInfo;
      process.env.AURA_CREDENTIAL_PROBE_URL = `http://127.0.0.1:${port}/v1beta/models`;

      try {
        let clock = 1_000;
        const pool = makePool(() => clock);
        TestHarness.assertEqual(await pool.verifyCredential(), true, 'An accepted credential must verify');
        TestHarness.assertEqual(calls, 1, 'One probe for the first verdict');

        clock += 59_000;
        TestHarness.assertEqual(await pool.verifyCredential(), true, 'Still cached inside the TTL');
        TestHarness.assertEqual(calls, 1, 'No provider call inside the TTL');

        clock += 2_000;
        TestHarness.assertEqual(await pool.verifyCredential(), true, 'Re-probed after the TTL, still valid');
        TestHarness.assertEqual(calls, 2, 'A stale verdict must not be pinned forever');
        pool.dispose();
      } finally {
        if (previous === undefined) delete process.env.AURA_CREDENTIAL_PROBE_URL;
        else process.env.AURA_CREDENTIAL_PROBE_URL = previous;
        await new Promise<void>((resolve) => stub.close(() => resolve()));
      }
    })
  );

  // Test 11: A provider that cannot be reached is not a working credential. Reporting ready
  // because "the network call didn't fail with a rejection" would be the same dishonesty with
  // extra steps.
  results.push(
    await TestHarness.runTest('GeminiProjectPool', 'An unreachable provider does not verify as a working credential', async () => {
      const previous = process.env.AURA_CREDENTIAL_PROBE_URL;
      // Reserved-for-documentation address with no route, so the connection fails immediately.
      process.env.AURA_CREDENTIAL_PROBE_URL = 'http://192.0.2.1/v1beta/models';
      try {
        const pool = makePool();
        TestHarness.assertEqual(
          await pool.verifyCredential(60_000),
          false,
          'An unreachable provider must not count as verified'
        );
        pool.dispose();
      } finally {
        if (previous === undefined) delete process.env.AURA_CREDENTIAL_PROBE_URL;
        else process.env.AURA_CREDENTIAL_PROBE_URL = previous;
      }
    })
  );

  return results;
}
