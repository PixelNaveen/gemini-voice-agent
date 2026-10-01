import { useCallback, useEffect, useRef } from 'react';

import {
  FAREWELL_GRACE_MS,
  IDLE_THRESHOLD_MS,
  SilenceLadderPolicy,
  type SilenceDecision,
} from '../core/conversation/SilenceLadderPolicy';
import type { SessionContext } from '../types';

/**
 * F-42: the inactivity ladder's timers, extracted from the transport hook.
 *
 * The transport hook no longer decides *when* a caller is considered gone; it only supplies
 * the transport and asks this to schedule. The policy itself - the escalation order, the
 * thresholds, the freeze guard - is in `SilenceLadderPolicy`, which is pure and tested.
 * This split exists because an untested rule that hangs up on a paying caller is worse than no
 * rule at all, and because the rules were previously unreachable by the project's test runner.
 *
 * A quiet caller is not necessarily a gone caller, so silence escalates: a light check-in, then
 * a firmer one, then a goodbye with time for it to play.
 */

export interface SilenceLadderOptions {
  /** Sends a spoken nudge down the open transport. False when nothing is connected. */
  sendPrompt: (prompt: string) => boolean;
  /** True while the agent holds the floor, which means the caller is not actually silent. */
  isTurnFrozen: () => boolean;
  /** Whether the call being watched is still the live one. */
  isSessionActive: (context: SessionContext) => boolean;
  /** The context the ladder is currently watching. */
  getContext: () => SessionContext | null;
  /** Closes the call once the farewell has had time to play. */
  endSession: (reason: string) => void | Promise<void>;
  /** Injectable timers, so scheduling is testable without real waiting. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  onNudge?: (index: number) => void;
}

export interface SilenceLadder {
  /** Arms the ladder for a session, replacing any pending timer. */
  schedule: (context: SessionContext) => void;
  /** Clears the escalation for the current quiet period. Called on real activity. */
  reset: () => void;
  /** Resets and clears the commitment to end. Call when a genuinely new call begins. */
  rearm: () => void;
  /** Clears the pending idle timer without touching the counter. */
  cancelPending: () => void;
  /** Cancels every timer owned here, including a farewell in flight. For unmount. */
  dispose: () => void;
  isEnding: () => boolean;
  checkCount: () => number;
}

export function useSilenceLadder(options: SilenceLadderOptions): SilenceLadder {
  const setTimer = options.setTimeoutFn ?? setTimeout;
  const clearTimer = options.clearTimeoutFn ?? clearTimeout;

  const policyRef = useRef<SilenceLadderPolicy | null>(null);
  if (policyRef.current === null) policyRef.current = new SilenceLadderPolicy();
  const policy = policyRef.current;

  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const farewellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read inside callbacks that must not re-subscribe when a caller re-renders with a fresh
  // options object, so the timers keep the behaviour they were armed with.
  const optsRef = useRef(options);
  optsRef.current = options;

  const cancelPending = useCallback(() => {
    if (idleRef.current) {
      clearTimer(idleRef.current);
      idleRef.current = null;
    }
  }, [clearTimer]);

  const reset = useCallback(() => {
    policy.reset();
    cancelPending();
  }, [cancelPending, policy]);

  const rearm = useCallback(() => {
    policy.rearm();
    cancelPending();
    if (farewellRef.current) {
      clearTimer(farewellRef.current);
      farewellRef.current = null;
    }
  }, [cancelPending, policy, clearTimer]);

  // A timeout that outlives the component closes a socket the page already tore down and
  // keeps this closure alive with it, so unmount drops both.
  useEffect(
    () => () => {
      if (idleRef.current) clearTimer(idleRef.current);
      idleRef.current = null;
      if (farewellRef.current) clearTimer(farewellRef.current);
      farewellRef.current = null;
    },
    [clearTimer]
  );

  const handle = useCallback(
    (decision: SilenceDecision, context: SessionContext) => {
      const current = optsRef.current;
      if (decision.kind === 'wait') return;
      if (decision.kind === 'nudge') {
        current.onNudge?.(decision.index);
        current.sendPrompt(decision.prompt);
        return;
      }
      // Tracked separately from the idle timer: `reset()` on activity must not revoke a
      // farewell that is already playing.
      farewellRef.current = setTimer(() => {
        // The caller may have reconnected and spoken during the farewell.
        if (!policy.shouldCloseNow(optsRef.current.getContext())) return;
        void optsRef.current.endSession('TIME_LIMIT');
      }, FAREWELL_GRACE_MS);
    },
    [policy, setTimer]
  );

  const schedule = useCallback(
    (context: SessionContext) => {
      const current = optsRef.current;
      cancelPending();
      if (!policy.shouldArm({ isActive: current.isSessionActive(context), turnFrozen: current.isTurnFrozen() })) {
        return;
      }
      idleRef.current = setTimer(() => {
        idleRef.current = null;
        const live = optsRef.current;
        handle(
          policy.advance({
            isActive: live.isSessionActive(context),
            turnFrozen: live.isTurnFrozen(),
          }),
          context
        );
      }, IDLE_THRESHOLD_MS);
    },
    [cancelPending, handle, policy, setTimer]
  );

  return {
    schedule,
    reset,
    rearm,
    cancelPending,
    dispose: rearm,
    isEnding: () => policy.isEnding(),
    checkCount: () => policy.checkCount(),
  };
}
