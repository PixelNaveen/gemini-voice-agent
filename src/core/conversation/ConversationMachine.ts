import { ConversationRuntimeState, INITIAL_CONVERSATION_STATE } from './ConversationState';
import { ConversationEvent } from './ConversationEvents';
import { conversationReducer, canEnterFinalConfirmation } from './ConversationReducer';
import { detectIntentFromText } from './Intent';
import { extractEntitiesFromText } from './Entities';

export type ConversationStateListener = (state: ConversationRuntimeState) => void;

export class ConversationMachine {
  private state: ConversationRuntimeState = { ...INITIAL_CONVERSATION_STATE };
  private listeners: ConversationStateListener[] = [];

  constructor(initialState?: Partial<ConversationRuntimeState>) {
    if (initialState) {
      this.state = { ...INITIAL_CONVERSATION_STATE, ...initialState };
    }
  }

  public getState(): ConversationRuntimeState {
    return this.state;
  }

  public subscribe(listener: ConversationStateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[ConversationMachine] Listener error:', err);
      }
    }
  }

  public dispatch(event: ConversationEvent): ConversationRuntimeState {
    this.state = conversationReducer(this.state, event);
    this.notify();
    return this.state;
  }

  /**
   * Processes a live transcript turn from the user or assistant,
   * extracts intent, entities, and corrections, and triggers state progression.
   */
  public processTurn(
    speaker: 'user' | 'agent',
    text: string
  ): { state: ConversationRuntimeState; corrections: string[] } {
    if (speaker === 'user') {
      // 1. Detect Intent
      const intentResult = detectIntentFromText(text);
      if (intentResult.primaryIntent !== 'GENERAL_INQUIRY' || !this.state.intent) {
        this.dispatch({
          type: 'INTENT_DETECTED',
          intent: intentResult.primaryIntent,
          secondaryIntents: intentResult.secondaryIntents,
          reason: `intent_detected_${intentResult.rawTrigger}`,
        });
      }

      // 2. Extract Entities & Corrections
      const { updated, corrections } = extractEntitiesFromText(text, this.state.entities);
      if (Object.keys(updated).length > 0) {
        this.dispatch({
          type: 'ENTITIES_UPDATED',
          entities: updated,
          corrections,
        });
      }

      // 3. Check for verification confirmation (e.g., "yes", "that's right", "correct")
      const lower = text.toLowerCase().trim();
      if (
        this.state.state === 'VERIFYING_INFORMATION' &&
        (lower === 'yes' || lower === 'yeah' || lower === 'correct' || lower === "that's right" || lower === 'yep')
      ) {
        this.dispatch({
          type: 'VERIFICATION_CONFIRMED',
          reason: 'caller_confirmed_verification',
        });
      }
    }

    return {
      state: this.state,
      corrections: [],
    };
  }

  public isBookingReady(): boolean {
    return canEnterFinalConfirmation(this.state);
  }

  public reset(): void {
    this.state = { ...INITIAL_CONVERSATION_STATE };
    this.notify();
  }
}
