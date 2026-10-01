import { GoogleGenAI } from '@google/genai';

export type ProjectStatus =
  | 'AVAILABLE'
  | 'DEGRADED'
  | 'COOLDOWN'
  | 'UNAVAILABLE'
  | 'RECOVERING';

export interface ProjectMetrics {
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  rateLimitCount: number; // 429
  serverErrorCount: number; // 5xx
  timeoutCount: number;
  goAwayCount: number;
  recoverySuccessCount: number;
  recoveryFailureCount: number;
  totalLatencyMs: number;
  latencySamples: number;
  lastFailureAt: number | null;
  lastUsedAt: number | null;
  cooldownUntil: number | null;
}

export interface GeminiProjectConfig {
  id: string;
  projectId: string;
  name: string;
  apiKey: string;
  model: string;
  region: string;
  enabled: boolean;
  capacity: number; // Max concurrent active sessions
}

export interface GeminiProjectInstance {
  config: GeminiProjectConfig;
  status: ProjectStatus;
  healthScore: number; // 0 - 100
  activeConnections: number;
  metrics: ProjectMetrics;
  client: GoogleGenAI;
}

export interface ProjectSelectionCriteria {
  preferProjectId?: string;
  excludeProjectIds?: string[];
  requiredCapacity?: number;
}

/** An acquired capacity slot whose release is safe to call repeatedly. */
export interface ProjectSlot {
  project: GeminiProjectInstance;
  /** Idempotent: the capacity counter is decremented at most once. */
  release: () => void;
}

export interface GeminiProjectPoolOptions {
  /**
   * Explicit cluster configuration. When omitted the pool is built from environment
   * variables. Tests inject a fixed cluster so they never depend on the developer's
   * local GEMINI_* environment, which previously made these suites fail on any machine
   * that had no credentials configured.
   */
  configs?: GeminiProjectConfig[];
  /** Injectable client factory; lets tests avoid constructing real SDK clients. */
  clientFactory?: (config: GeminiProjectConfig) => GoogleGenAI;
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * SECTION 10 & 11: Multi-Project Gemini Cluster & Dynamic Health Scoring
 *
 * Foundational Invariants:
 * - Credentials & API keys are strictly SERVER-ONLY. Never exposed to browser.
 * - Manages independent Google Cloud / AI Studio projects (Alpha, Beta, Gamma, Delta, Epsilon).
 * - Multi-metric weighted health scoring determines project eligibility.
 * - Dynamic cooldown and automatic recovery probes prevent traffic black holes.
 * - A cluster holding no usable credential is an explicit MISCONFIGURED state, not an
 *   empty pool that silently fails on the first live call.
 * - Gemini rate limits are enforced per Google Cloud project, not per API key, so keys that
 *   share a project are collapsed into a single admission slot. Only keys from genuinely
 *   separate Google Cloud projects increase real capacity.
 */

/**
 * Default admission limit per Google Cloud project. Deliberately conservative: exceeding
 * the true provider limit produces 429s mid-call, which is a customer-visible failure,
 * whereas a low cap produces a clean `no_capacity` that the client can retry.
 */
const DEFAULT_PROJECT_CAPACITY = 4;

/**
 * Whether admission may exceed a project's configured capacity when every project is
 * saturated. Off by default: see the emergency-fallback branch in `acquire`.
 */
function overCapacityFallbackEnabled(): boolean {
  return process.env.AURA_OVER_CAPACITY_FALLBACK === 'true';
}

/**
 * Identifies a credential without retaining or logging it, so that duplicate keys are
 * detected during initialization rather than by watching live calls fail.
 */
function fingerprintKey(apiKey: string): string {
  let hash = 0;
  for (let i = 0; i < apiKey.length; i++) {
    hash = (hash * 31 + apiKey.charCodeAt(i)) | 0;
  }
  return `key-${apiKey.length}-${(hash >>> 0).toString(16)}`;
}

export class GeminiProjectPool {
  private static instance: GeminiProjectPool | null = null;
  private projects: Map<string, GeminiProjectInstance> = new Map();
  private primaryApiKey: string = '';
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private readonly clientFactory: (config: GeminiProjectConfig) => GoogleGenAI;
  private configurationError: string | null = null;
  /** Cached outcome of the last real credential check; null until one has run. */
  private credentialProbeAt: number | null = null;
  private credentialProbeResult: boolean | null = null;
  constructor(options: GeminiProjectPoolOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.log = options.log ?? ((m) => console.log(m));
    this.clientFactory =
      options.clientFactory ??
      ((config) =>
        new GoogleGenAI({
          apiKey: config.apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
              'X-Aura-Cluster-Project': config.id,
            },
          },
        }));
    this.primaryApiKey = process.env.GEMINI_API_KEY || '';
    this.initializeProjects(options.configs);
  }

  public static getInstance(): GeminiProjectPool {
    if (!GeminiProjectPool.instance) {
      GeminiProjectPool.instance = new GeminiProjectPool();
    }
    return GeminiProjectPool.instance;
  }

  /**
   * Builds a fully isolated pool. Used by the test suite and by any tooling that must
   * not touch the process-wide singleton.
   */
  public static createIsolated(options: GeminiProjectPoolOptions = {}): GeminiProjectPool {
    return new GeminiProjectPool(options);
  }

  /** Tears down the process-wide singleton so a new configuration can be loaded. */
  public static resetInstance(): void {
    GeminiProjectPool.instance?.dispose();
    GeminiProjectPool.instance = null;
  }

  public dispose(): void {
    this.projects.clear();
  }

  /** True when at least one project holds a credential and can serve traffic. */
  public hasUsableProject(): boolean {
    return this.projects.size > 0;
  }

  /**
   * Whether a credential was actually accepted by the provider.
   *
   * `hasUsableProject()` only proves a key *string* is present, which is not the same as
   * having a working credential: an expired, revoked, mistyped or revoked-and-rotated key all
   * satisfy it. Readiness built on that alone reports `HEALTHY` for an instance that cannot
   * take a single call - the exact failure the health check exists to catch, reproduced by the
   * health check itself.
   *
   * This calls the cheapest endpoint that still authenticates (`models.list`), so it
   * validates the credential without running inference or material generation quota. The
   * result is cached: an orchestrator polling readiness every few seconds must not turn into
   * a request storm against the provider, and the credential's validity does not change
   * second to second.
   *
   * Returns `null` when no probe has completed yet, which is deliberately not the same as
   * `true` - unproven is not proven.
   */
  public async verifyCredential(cacheTtlMs = 60_000): Promise<boolean | null> {
    if (this.credentialProbeAt && this.now() - this.credentialProbeAt < cacheTtlMs) {
      return this.credentialProbeResult;
    }

    const project = this.projects.values().next().value as GeminiProjectInstance | undefined;
    if (!project) {
      this.credentialProbeAt = this.now();
      this.credentialProbeResult = false;
      return false;
    }

    // Deliberately `models.list` and not a generation call: it authenticates the credential
    // and is effectively free, so a readiness probe does not spend the budget a real call
    // needs.
    //
    // The endpoint is overridable so the readiness path can be tested end to end - including
    // the rejection branch - without a real credential or any quota spend. The override
    // changes only where the probe is sent; it cannot make the probe succeed on its own.
    const base =
      process.env.AURA_CREDENTIAL_PROBE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/models';
    const separator = base.includes('?') ? '&' : '?';
    const url = `${base}${separator}key=${encodeURIComponent(project.config.apiKey)}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const ok = response.ok;
      this.credentialProbeAt = this.now();
      this.credentialProbeResult = ok;
      if (!ok) {
        this.log(
          `[GeminiProjectPool] Credential probe rejected (HTTP ${response.status}). Readiness will refuse traffic.`
        );
      }
      return ok;
    } catch (err: any) {
      this.credentialProbeAt = this.now();
      this.credentialProbeResult = false;
      // A network failure is not proof the credential is bad, but it is proof we cannot make
      // a call, so readiness must not claim otherwise.
      this.log(`[GeminiProjectPool] Credential probe failed: ${err?.message ?? err}`);
      return false;
    }
  }

  /**
   * Non-null when the cluster cannot serve traffic. Surfaced at startup so a missing key
   * is a clear configuration error rather than a silent first-call failure.
   */
  public getConfigurationError(): string | null {
    return this.configurationError;
  }

  /**
   * SECTION 10.2: Initialize the project cluster.
   *
   * Builds the cluster from injected configurations when supplied, otherwise from the
   * environment. `capacity: 0` below means "defer to AURA_PROJECT_CAPACITY": a hard-coded
   * number would silently override the operator's setting, and would advertise a ceiling
   * that nobody measured against a real rate-limit page.
   */
  private initializeProjects(injected?: GeminiProjectConfig[]): void {
    const rawConfigs: GeminiProjectConfig[] = injected ?? [
      {
        id: 'proj-alpha',
        projectId: process.env.GEMINI_PROJECT_ALPHA_ID || 'aura-gemini-alpha',
        name: 'Cluster Alpha (Primary)',
        apiKey: process.env.GEMINI_PROJECT_ALPHA_KEY || process.env.GEMINI_API_KEY || '',
        model: 'gemini-3.8-live',
        region: 'us-central1',
        enabled: true,
        capacity: 0,
      },
      {
        id: 'proj-beta',
        projectId: process.env.GEMINI_PROJECT_BETA_ID || 'aura-gemini-beta',
        name: 'Cluster Beta',
        apiKey: process.env.GEMINI_PROJECT_BETA_KEY || process.env.GEMINI_PROJECT_2_KEY || this.primaryApiKey,
        model: 'gemini-3.8-live',
        region: 'us-east4',
        enabled: true,
        capacity: 0,
      },
      {
        id: 'proj-gamma',
        projectId: process.env.GEMINI_PROJECT_GAMMA_ID || 'aura-gemini-gamma',
        name: 'Cluster Gamma',
        apiKey: process.env.GEMINI_PROJECT_GAMMA_KEY || process.env.GEMINI_PROJECT_3_KEY || this.primaryApiKey,
        model: 'gemini-3.8-live',
        region: 'us-west1',
        enabled: true,
        capacity: 0,
      },
      {
        id: 'proj-delta',
        projectId: process.env.GEMINI_PROJECT_DELTA_ID || 'aura-gemini-delta',
        name: 'Cluster Delta',
        apiKey: process.env.GEMINI_PROJECT_DELTA_KEY || process.env.GEMINI_PROJECT_4_KEY || this.primaryApiKey,
        model: 'gemini-3.8-live',
        region: 'asia-southeast1',
        enabled: true,
        capacity: 0,
      },
      {
        id: 'proj-epsilon',
        projectId: process.env.GEMINI_PROJECT_EPSILON_ID || 'aura-gemini-epsilon',
        name: 'Cluster Epsilon',
        apiKey: process.env.GEMINI_PROJECT_EPSILON_KEY || process.env.GEMINI_PROJECT_5_KEY || this.primaryApiKey,
        model: 'gemini-3.8-live',
        region: 'europe-west4',
        enabled: true,
        capacity: 0,
      },
    ];

    // A cluster only provides real quota isolation when each project has its own Google
    // Cloud project, and Gemini rate limits are applied per project rather than per API key.
    // Two keys minted from the same project share one bucket, so registering them as five
    // "projects" would multiply the advertised capacity by five while the real ceiling stays
    // exactly where it was. That is worse than a single project: saturation stops being
    // visible at admission time and turns into 429s during live calls.
    //
    // So collapse identical keys into one slot, and set the cap from configuration rather
    // than from a number that only happens to be right for someone else's quota.
    const deduped = new Map<string, GeminiProjectConfig>();
    for (const config of rawConfigs) {
      if (!config.apiKey) continue;
      const keyFingerprint = fingerprintKey(config.apiKey);
      const existing = deduped.get(keyFingerprint);
      if (existing) {
        this.log(
          `[GeminiProjectPool] Collapsing "${config.name}" into "${existing.name}": ` +
            `both use the same Google Cloud project, so they share one rate-limit bucket.`
        );
        continue;
      }
      deduped.set(keyFingerprint, {
        ...config,
        // An explicitly supplied capacity always wins. Only fall back to the environment
        // default when the caller did not state one, so an injected configuration (tests,
        // or any future programmatic setup) is never silently overridden.
        capacity: config.capacity > 0 ? config.capacity : this.configuredCapacity(),
      });
    }

    for (const config of deduped.values()) {
      const metrics: ProjectMetrics = {
        totalConnections: 0,
        successfulConnections: 0,
        failedConnections: 0,
        rateLimitCount: 0,
        serverErrorCount: 0,
        timeoutCount: 0,
        goAwayCount: 0,
        recoverySuccessCount: 0,
        recoveryFailureCount: 0,
        totalLatencyMs: 0,
        latencySamples: 0,
        lastFailureAt: null,
        lastUsedAt: null,
        cooldownUntil: null,
      };

      this.projects.set(config.id, {
        config,
        status: 'AVAILABLE',
        healthScore: 100,
        activeConnections: 0,
        metrics,
        client: this.clientFactory(config),
      });
    }

    if (this.projects.size === 0) {
      this.configurationError =
        'No Gemini project has a usable API key. Set GEMINI_API_KEY (or the per-project ' +
        'GEMINI_PROJECT_*_KEY variables) before starting the server.';
      this.log(`[GeminiProjectPool] MISCONFIGURED: ${this.configurationError}`);
      return;
    }

    if (this.projects.size === 1) {
      this.log(
        `[GeminiProjectPool] Single-project mode: ${this.projects.size} distinct key, ` +
          `max ${this.configuredCapacity()} concurrent sessions. Add API keys from ADDITIONAL ` +
          `Google Cloud projects to raise this; extra keys from the same project will not.`
      );
    } else {
      this.log(
        `[GeminiProjectPool] Initialized ${this.projects.size}-project cluster ` +
          `(max ${this.configuredCapacity()} concurrent sessions per project)`
      );
    }
  }

  /**
   * Concurrent sessions allowed per Google Cloud project.
   *
   * This is an admission-control number, not a measurement. Set it from the rate-limit page
   * for your project, and keep it at or below the number of concurrent Live sessions that
   * project can actually sustain.
   */
  private configuredCapacity(): number {
    const raw = Number(process.env.AURA_PROJECT_CAPACITY);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_PROJECT_CAPACITY;
  }

  /**
   * SECTION 11.3: Compute dynamic health score for a project (0 - 100).
   *
   * Weighted Engineering Routing Formula:
   * - Success Rate Component (35% weight)
   * - Rate Limit / 429 Penalty (25% weight)
   * - Latency Performance Component (20% weight)
   * - Available Capacity Ratio (10% weight)
   * - Stability / GoAway Frequency (10% weight)
   */
  public calculateHealthScore(project: GeminiProjectInstance): number {
    const { metrics, activeConnections, config } = project;
    const now = this.now();

    // Check if in active cooldown period
    if (metrics.cooldownUntil && now < metrics.cooldownUntil) {
      return 10; // Low score during cooldown probe period
    }

    // 1. Success Rate (0 - 35)
    let successScore = 35;
    if (metrics.totalConnections > 0) {
      const successRate = metrics.successfulConnections / metrics.totalConnections;
      successScore = Math.round(successRate * 35);
    }

    // 2. Rate Limit & 5xx Penalty (0 - 25)
    let errorScore = 25;
    const recentErrors = metrics.rateLimitCount * 3 + metrics.serverErrorCount * 2 + metrics.timeoutCount;
    if (recentErrors > 0) {
      errorScore = Math.max(0, 25 - recentErrors * 5);
    }

    // 3. Latency Performance (0 - 20)
    let latencyScore = 20;
    if (metrics.latencySamples > 0) {
      const avgLatency = metrics.totalLatencyMs / metrics.latencySamples;
      if (avgLatency > 1500) {
        latencyScore = 5;
      } else if (avgLatency > 800) {
        latencyScore = 12;
      } else if (avgLatency > 400) {
        latencyScore = 16;
      } else {
        latencyScore = 20;
      }
    }

    // 4. Capacity Ratio (0 - 10)
    const availableCapacity = Math.max(0, config.capacity - activeConnections);
    const capacityRatio = config.capacity > 0 ? availableCapacity / config.capacity : 1;
    const capacityScore = Math.round(capacityRatio * 10);

    // 5. GoAway / Stability Factor (0 - 10)
    const stabilityScore = Math.max(0, 10 - metrics.goAwayCount * 2);

    const totalScore = Math.min(
      100,
      Math.max(0, successScore + errorScore + latencyScore + capacityScore + stabilityScore)
    );
    return totalScore;
  }

  /**
   * SECTION 11.2: Updates the operational state of a project based on its dynamic health score.
   */
  public refreshProjectHealth(project: GeminiProjectInstance): void {
    const now = this.now();

    if (metricsAreExpired(project.metrics, now)) {
      project.metrics.rateLimitCount = Math.max(0, project.metrics.rateLimitCount - 1);
      project.metrics.serverErrorCount = Math.max(0, project.metrics.serverErrorCount - 1);
    }

    const score = this.calculateHealthScore(project);
    project.healthScore = score;

    if (project.metrics.cooldownUntil && now < project.metrics.cooldownUntil) {
      project.status = 'COOLDOWN';
    } else if (score >= 80) {
      project.status = 'AVAILABLE';
    } else if (score >= 45) {
      project.status = 'DEGRADED';
    } else if (score >= 15) {
      project.status = 'RECOVERING';
    } else {
      project.status = 'UNAVAILABLE';
    }
  }

  /**
   * SECTION 10.4: Acquires the most optimal healthy project for a session connection.
   */
  public acquire(criteria: ProjectSelectionCriteria = {}): GeminiProjectInstance | null {
    // 1. Refresh health across all registered projects
    for (const project of this.projects.values()) {
      this.refreshProjectHealth(project);
    }

    // 2. Check if preferred project is available and healthy. An explicit exclusion always
    //    wins over a preference, so a caller can force a project off a failing key.
    if (criteria.preferProjectId) {
      const preferred = this.projects.get(criteria.preferProjectId);
      if (
        preferred &&
        preferred.config.enabled &&
        !(criteria.excludeProjectIds?.includes(preferred.config.id) ?? false) &&
        (preferred.status === 'AVAILABLE' || preferred.status === 'DEGRADED') &&
        preferred.activeConnections < preferred.config.capacity
      ) {
        preferred.activeConnections++;
        preferred.metrics.lastUsedAt = this.now();
        preferred.metrics.totalConnections++;
        this.log(
          `[GeminiProjectPool] Acquired preferred project "${preferred.config.name}" (Score: ${preferred.healthScore})`
        );
        return preferred;
      }
    }

    // 3. Filter candidates
    const candidates = Array.from(this.projects.values()).filter((p) => {
      if (!p.config.enabled) return false;
      if (criteria.excludeProjectIds?.includes(p.config.id)) return false;
      if (p.status === 'UNAVAILABLE') return false;
      if (p.activeConnections >= p.config.capacity) return false;
      return true;
    });

    if (candidates.length === 0) {
      // A misconfigured cluster must fail loudly rather than hand back a project that
      // holds no credential, which would surface much later as an opaque auth error.
      if (this.projects.size === 0) {
        this.log(`[GeminiProjectPool] REFUSING acquisition: ${this.configurationError}`);
        return null;
      }
      // The emergency fallback must still honour the exclusion list. Returning an
      // explicitly quarantined project here would silently defeat the caller's routing
      // decision, which is exactly the kind of quiet override that is impossible to
      // debug from the outside.
      const eligible = Array.from(this.projects.values()).filter(
        (p) => !criteria.excludeProjectIds?.includes(p.config.id)
      );
      if (eligible.length === 0) {
        this.log('[GeminiProjectPool] All available projects are excluded by criteria; refusing acquisition.');
        return null;
      }

      // Every eligible project is at its configured capacity. Over-admitting here looks
      // like resilience, but the capacity number is the only thing standing between a burst
      // of calls and provider-side 429s, which fail a live conversation mid-sentence. A
      // clean `no_capacity` lets the caller wait and retry; a 429 drops the call. So refuse
      // by default and make the override an explicit, deliberate choice.
      if (!overCapacityFallbackEnabled()) {
        this.log(
          '[GeminiProjectPool] All projects at capacity; refusing acquisition. ' +
            'Set AURA_OVER_CAPACITY_FALLBACK=true only if you have verified your provider ' +
            'quota is higher than the configured capacity.'
        );
        return null;
      }

      this.log('[GeminiProjectPool] No healthy project available; using lowest-load eligible project.');
      // Emergency fallback: the eligible project with the fewest active connections.
      const emergency = eligible.sort((a, b) => a.activeConnections - b.activeConnections)[0];
      emergency.activeConnections++;
      emergency.metrics.lastUsedAt = this.now();
      return emergency;
    }

    // 4. Sort by health score descending, then lowest active connections
    candidates.sort((a, b) => {
      if (b.healthScore !== a.healthScore) {
        return b.healthScore - a.healthScore;
      }
      return a.activeConnections - b.activeConnections;
    });

    const chosen = candidates[0];
    chosen.activeConnections++;
    chosen.metrics.lastUsedAt = this.now();
    chosen.metrics.totalConnections++;

    this.log(
      `[GeminiProjectPool] Acquired optimal project "${chosen.config.name}" [${chosen.config.id}] ` +
        `(Score: ${chosen.healthScore}, Active: ${chosen.activeConnections}/${chosen.config.capacity})`
    );
    return chosen;
  }

  /**
   * Releases an acquired connection slot back to the project pool.
   *
   * Callers that can fire more than one teardown path (explicit close AND a provider
   * onclose callback) must use `acquireSlot` instead, which returns an idempotent
   * release function. Calling this directly more than once for the same logical session
   * would otherwise free a slot that belongs to a different call.
   */
  public release(projectId: string): void {
    const project = this.projects.get(projectId);
    if (project) {
      project.activeConnections = Math.max(0, project.activeConnections - 1);
      this.refreshProjectHealth(project);
    }
  }

  /**
   * SECTION 10.4: Idempotent slot acquisition.
   *
   * The returned `release()` may be called any number of times from any number of teardown
   * paths; the underlying capacity counter is decremented exactly once.
   */
  public acquireSlot(criteria: ProjectSelectionCriteria = {}): ProjectSlot | null {
    const project = this.acquire(criteria);
    if (!project) return null;
    let released = false;
    return {
      project,
      release: () => {
        if (released) return;
        released = true;
        this.release(project.config.id);
      },
    };
  }

  /**
   * Reports successful connection establishment.
   */
  public markHealthy(projectId: string, latencyMs?: number): void {
    const project = this.projects.get(projectId);
    if (!project) return;

    project.metrics.successfulConnections++;
    if (latencyMs !== undefined) {
      project.metrics.totalLatencyMs += latencyMs;
      project.metrics.latencySamples++;
    }
    this.refreshProjectHealth(project);
  }

  /**
   * Reports failure or rate-limit on a project.
   */
  public markUnhealthy(projectId: string, reason: string, errorCode?: number | string): void {
    const project = this.projects.get(projectId);
    if (!project) return;

    const now = this.now();
    project.metrics.failedConnections++;
    project.metrics.lastFailureAt = now;

    const r = (reason || '').toLowerCase();
    if (errorCode === 429 || r.includes('429') || r.includes('quota') || r.includes('resource_exhausted')) {
      project.metrics.rateLimitCount++;
      // Set cooldown period: 10 seconds for 429 rate limit
      project.metrics.cooldownUntil = now + 10000;
      this.log(
        `[GeminiProjectPool] Project "${project.config.name}" encountered 429 quota. Cooldown set for 10s.`
      );
    } else if (errorCode === 503 || errorCode === 500 || r.includes('503') || r.includes('overloaded')) {
      project.metrics.serverErrorCount++;
      project.metrics.cooldownUntil = now + 5000;
    } else if (r.includes('timeout')) {
      project.metrics.timeoutCount++;
    }

    this.refreshProjectHealth(project);
  }

  /**
   * Records a GoAway event received on a project.
   */
  public recordGoAway(projectId: string): void {
    const project = this.projects.get(projectId);
    if (!project) return;

    project.metrics.goAwayCount++;
    this.refreshProjectHealth(project);
    this.log(`[GeminiProjectPool] Recorded GoAway event on project "${project.config.name}"`);
  }

  /**
   * Returns cluster summary for diagnostics or health reporting.
   */
  public getClusterStatus(): Array<{
    id: string;
    name: string;
    projectId: string;
    status: ProjectStatus;
    healthScore: number;
    activeConnections: number;
    capacity: number;
  }> {
    return Array.from(this.projects.values()).map((p) => {
      this.refreshProjectHealth(p);
      return {
        id: p.config.id,
        name: p.config.name,
        projectId: p.config.projectId,
        status: p.status,
        healthScore: p.healthScore,
        activeConnections: p.activeConnections,
        capacity: p.config.capacity,
      };
    });
  }

  /**
   * Direct accessor by project ID.
   */
  public getProject(projectId: string): GeminiProjectInstance | undefined {
    return this.projects.get(projectId);
  }

  /**
   * Returns all registered projects.
   */
  public getAllProjects(): GeminiProjectInstance[] {
    return Array.from(this.projects.values());
  }
}

function metricsAreExpired(metrics: ProjectMetrics, now: number): boolean {
  if (!metrics.lastFailureAt) return false;
  return now - metrics.lastFailureAt > 60000; // Decay penalties after 1 minute of health
}
