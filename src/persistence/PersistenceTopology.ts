import { DependencyHealth } from '../observability/DependencyHealth';

/**
 * F-20/F-11: making the persistence topology impossible to misread.
 *
 * Appointments, tool-operation records and sessions are journalled to a local file. That is
 * genuinely durable across a restart, which is a real improvement over the in-memory map it
 * replaced, and it is verified by tests. It is also **instance-local**, and that has a
 * consequence which nothing in the codebase currently states anywhere:
 *
 * On a platform that runs more than one instance, two servers do not see each other's
 * appointments. Both accept the same 14:00 booking, both write their own journal, and the
 * caller is told twice that they hold the slot. The file lock that makes concurrent writes
 * safe *within* one machine is not a distributed lock, and no amount of local atomicity
 * prevents this.
 *
 * So the risk is not that the journal is weak. It is that it looks strong. Someone can deploy
 * to Vercel, see green readiness, take bookings, and have no signal that a second instance is
 * double-booking. This module exists to remove that silence.
 *
 * It deliberately does NOT pretend to fix the topology. Writing an HTTP key-value adapter
 * would look like a fix and prove nothing: the correctness requirement is a *transactional
 * read-modify-write* - a plain GET/SET pair cannot decide "is 14:00 free, and claim it"
 * atomically across processes - and an adapter that has never run against a real provider is
 * a guess wearing a type signature. See `REQUIREMENTS_FOR_SHARED_PERSISTENCE` below for what a
 * real backend has to provide.
 */

/**
 * What a shared persistence backend must provide before this code can use one.
 *
 * Kept as prose rather than an interface so nobody implements to the wrong thing: the
 * difficult requirement is atomicity, and it is easy to satisfy the method list and miss it.
 */
export const REQUIREMENTS_FOR_SHARED_PERSISTENCE = [
  'A single atomic read-modify-write per record. Deciding "the 14:00 slot is free" and claiming it must be one indivisible operation, otherwise two instances both see it free and both accept.',
  'Conditional write on a version token, so a writer that lost a race is told it lost rather than overwriting the winner.',
  'Durability across instance replacement, with an explicit write acknowledgement before a booking is confirmed to a caller.',
  'A total ordering or uniqueness guarantee on the (persona, date, startTime) tuple - enforced by the store, not by application code that runs in two places.',
  'An expiry policy for sessions, so abandoned calls do not accumulate without bound.',
] as const;

export type PersistenceTopology = 'SINGLE_INSTANCE' | 'MULTI_INSTANCE_RISK';

/**
 * Detects whether this process is one of several.
 *
 * The detection is deliberately conservative and errs toward reporting risk. A false positive
 * costs an operator one explicit acknowledgement; a false negative lets them double-book
 * real customers. Being wrong in the safe direction is the whole point.
 */
export function detectTopology(env: NodeJS.ProcessEnv = process.env): PersistenceTopology {
  // Explicit operator override, for the case where the platform cannot be detected.
  const override = (env.AURA_PERSISTENCE_TOPOLOGY ?? '').trim().toUpperCase();
  if (override === 'SINGLE_INSTANCE') return 'SINGLE_INSTANCE';
  if (override === 'MULTI_INSTANCE') return 'MULTI_INSTANCE_RISK';

  // Vercel, Netlify, Cloudflare Workers and AWS Lambda all run many short-lived instances
  // against an ephemeral filesystem. `AURA_DATA_DIR` pointing at a mounted network volume is
  // the one configuration where that is not true.
  const onEphemeralPlatform = Boolean(env.VERCEL || env.NETLIFY || env.CF_PAGES || env.AWS_LAMBDA_FUNCTION_NAME);
  if (onEphemeralPlatform && !env.AURA_SHARED_DATA_DIR) return 'MULTI_INSTANCE_RISK';

  return 'SINGLE_INSTANCE';
}

/**
 * Whether an operator has accepted the multi-instance risk for this deployment.
 *
 * Required so that running on a many-instance platform is a decision someone made and can be
 * held to, rather than a default nobody chose. Without it, the unsafe case fails readiness.
 */
export function riskAcknowledged(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.AURA_ACK_MULTI_INSTANCE_PERSISTENCE ?? '').trim().toLowerCase();
  return flag === 'true' || flag === 'yes' || flag === '1';
}

/**
 * Records the topology as a dependency so it appears in readiness and metrics.
 *
 * Returns whether this deployment is safe to route bookings to. `AURA_REQUIRE_SHARED_STORE`
 * forces the unsafe case to fail readiness even when acknowledged, which is the setting for a
 * deployment that genuinely must not double-book.
 */
export function reportPersistenceTopology(env: NodeJS.ProcessEnv = process.env): {
  topology: PersistenceTopology;
  safe: boolean;
  acknowledged: boolean;
} {
  const topology = detectTopology(env);
  const acknowledged = riskAcknowledged(env);
  const strict = (env.AURA_REQUIRE_SHARED_STORE ?? '').trim().toLowerCase() === 'true';
  // Strict mode is not a stronger warning; it removes the acknowledgement escape hatch
  // entirely. Otherwise the flag would only change the message while still routing bookings
  // to an instance that can double-book, which is the exact failure it exists to prevent.
  const safe = topology === 'SINGLE_INSTANCE' || (acknowledged && !strict);

  if (topology === 'MULTI_INSTANCE_RISK') {
    DependencyHealth.updateStatus(
      'SharedPersistence',
      safe ? 'DEGRADED' : 'DOWN',
      strict
        ? 'Multiple instances detected with no shared store, and AURA_REQUIRE_SHARED_STORE forbids accepting this. Appointments and sessions cannot be made safe here.'
        : acknowledged
          ? 'Multiple instances detected with no shared store. An operator has acknowledged that duplicate bookings are possible.'
          : 'Multiple instances detected with no shared store. Two instances can each accept the same slot. Set AURA_ACK_MULTI_INSTANCE_PERSISTENCE=true to accept this, or provide a shared transactional store.'
    );
  } else {
    DependencyHealth.updateStatus(
      'SharedPersistence',
      'HEALTHY',
      'Single instance: the local journal is authoritative and is visible to every request.'
    );
  }

  return { topology, safe, acknowledged };
}

/** A one-line, log-safe description for startup output. Contains no secrets. */
export function describeTopology(env: NodeJS.ProcessEnv = process.env): string {
  const { topology, safe } = reportPersistenceTopology(env);
  if (topology === 'SINGLE_INSTANCE') {
    return '[Persistence] Single instance. The local journal is authoritative.';
  }
  return (
    `[Persistence] Multiple instances with no shared store detected. Duplicate bookings are possible. ` +
    `ready=${safe}. ${REQUIREMENTS_FOR_SHARED_PERSISTENCE.length} requirements for a real backend are documented in src/persistence/PersistenceTopology.ts.`
  );
}
