import type { SessionContext } from '../../types';

/**
 * The decision half of the inactivity ladder, with no timers and no React.
 *
 * This exists so the escalation policy can be tested directly. When this logic lived inline in
 * the transport hook it was untestable in the project's runner - there is no React renderer
 * here - and an untested policy that decides when to hang up on a paying caller is not a
 * policy, it is a guess. Splitting "what should happen" from "when should it fire" leaves this
 * side pure and the hook as a thin scheduler.
 *
 * The two behaviours that are easy to break and impossible to notice in review:
 *
 * - a turn in flight suppresses everything, because a caller listening to the agent is not a
 *   silent caller, and prompting them mid-answer produces two conversations at once;
 * - escalation is per quiet period, not per call, so three unrelated quiet moments across a
 *   long call cannot accumulate into a hang-up no single moment warranted.
 */

/** Escalating nudges, in order. The last one is the farewell. */
export const SILENCE_PROMPTS = [
  'Hello? Are you still there? How can I help you today?',
  "Just checking in—are you still on the line? I'm here whenever you're ready.",
  "It seems like you might have stepped away or we lost connection. I'll go ahead and end the call for now. Feel free to call us back anytime. Have a great day!",
] as const;

/** Quiet period before the first nudge. */
export const IDLE_THRESHOLD_MS = 10_000;

/** How long the farewell is given to play before the call is closed. */
export const FAREWELL_GRACE_MS = 5_500;

/** Number of unanswered nudges before the call is ended. */
export const MAX_CHECKS = SILENCE_PROMPTS.length;

export interface SilenceProbe {
  /** False once the call this ladder belongs to is no longer the live one. */
  isActive: boolean;
  /** True while the agent holds the floor. */
  turnFrozen: boolean;
}

export type SilenceDecision =
  /** Stay armed, nothing to send yet. */
  | { kind: 'wait' }
  /** Send this prompt. */
  | { kind: 'nudge'; index: number; prompt: string }
  /** The farewell is committed; close the call after the grace period. */
  | { kind: 'end' };

export class SilenceLadderPolicy {
  private count = 0;
  private ending = false;

  /** Nudges sent in the current quiet period, 0-3. */
  public checkCount(): number {
    return this.count;
  }

  /** True once the ladder has committed to ending the call. */
  public isEnding(): boolean {
    return this.ending;
  }

  /**
   * Activity happened: clear the escalation but keep any in-flight farewell.
   *
   * Deliberately not the same as {@link rearm}. A caller who speaks again during the goodbye
   * is not unheard, but the farewell is already playing and a second prompt on top of it
   * would talk over the agent.
   */
  public reset(): void {
    this.count = 0;
  }

  /** A new call: clear everything, including the commitment to end. */
  public rearm(): void {
    this.count = 0;
    this.ending = false;
  }

  /** Whether the ladder should arm for this context at all. */
  public shouldArm(probe: SilenceProbe): boolean {
    return probe.isActive && !probe.turnFrozen && !this.ending;
  }

  /**
   * Advance one step after a quiet period elapsed.
   *
   * Returns `wait` when the context is no longer valid, which is the common case: a nudge
   * timer fires on a schedule, and any of the guards may have changed in the meantime.
   */
  public advance(probe: SilenceProbe): SilenceDecision {
    if (probe.turnFrozen) return { kind: 'wait' };
    if (!probe.isActive) return { kind: 'wait' };
    if (this.ending) return { kind: 'wait' };

    this.count += 1;
    const index = this.count - 1;
    if (this.count < MAX_CHECKS) {
      return { kind: 'nudge', index, prompt: SILENCE_PROMPTS[index] };
    }
    this.ending = true;
    return { kind: 'end' };
  }

  /** Whether the farewell should still be honoured, i.e. the call is still live. */
  public shouldCloseNow(context: SessionContext | null): boolean {
    return this.ending && context !== null;
  }
}
