import { useCallback, useMemo } from 'react';
import { MemoryFact } from '../types';
import { MemoryManager, type SessionFact } from '../core/memory';

export type MemoryFactCategory = SessionFact['category'];

export interface SessionMemoryControlsDeps {
  memoryManagerRef: React.RefObject<MemoryManager | null>;
  /** The facts seeded by the system when the session starts. */
  seededFacts: SessionFact[];
  sessionFacts: SessionFact[];
  /** Clears the visible transcript, which a memory reset must also do. */
  clearTranscripts: () => void;
  /**
   * Tells the server the operator erased this call's memory.
   *
   * Returns false when there is no live session, so the caller can tell a reset that was
   * merely local from one the provider actually heard.
   */
  announceMemoryReset: (sessionId: string) => boolean;
}

export interface SessionMemoryControls {
  addMemoryFact: (content: string, category?: MemoryFactCategory) => void;
  deleteMemoryFact: (id: string) => void;
  clearAllMemory: () => void;
  memoryFacts: MemoryFact[];
}

/**
 * F-28 and F-42: the memory inspector's write operations, extracted from `useVoiceAgent`.
 *
 * The important part is not the extraction, it is the rule these three operations share.
 *
 * The seeded protocol rules and the caller's own statements live in one list. Resetting memory
 * used to call `clear()`, which emptied that list entirely, so the agent was left with no
 * protocol rules for the rest of the call, and deleting one of them removed it permanently - the
 * instruction did not come back on the next call. That is the difference between forgetting
 * something a caller said and forgetting how the agent is required to behave.
 *
 * So a reset means: drop everything the caller said, keep everything the system asserts, and
 * tell the provider, because the model has already been handed the facts the operator just
 * erased and will otherwise keep working from them and can quote a deleted phone number back.
 */
export function useSessionMemoryControls(deps: SessionMemoryControlsDeps): SessionMemoryControls {
  const { memoryManagerRef, seededFacts, clearTranscripts, announceMemoryReset } = deps;

  const seededIds = useMemo(() => new Set(seededFacts.map((f) => f.id)), [seededFacts]);

  const addMemoryFact = useCallback(
    (content: string, category: MemoryFactCategory = 'fact') => {
      memoryManagerRef.current?.addSessionFact(content, category, 'USER');
    },
    [memoryManagerRef]
  );

  const deleteMemoryFact = useCallback(
    (id: string) => {
      // The seeded rules are not user data. The manager refuses them, and the check here as well
      // so the UI does not report a deletion that did not happen.
      if (seededIds.has(id)) {
        console.warn(`[Memory] Refusing to delete seeded rule "${id}"; protocol rules are not user data.`);
        return;
      }
      memoryManagerRef.current?.removeSessionFact(id);
    },
    [memoryManagerRef, seededIds]
  );

  const clearAllMemory = useCallback(() => {
    const manager = memoryManagerRef.current;
    if (!manager) return;

    // `clear()` forgets the caller; `restoreSeededFacts` puts back the system rules. The manager
    // owns that distinction, so the order matters and is asserted by a test.
    manager.clear();
    manager.restoreSeededFacts(seededFacts);
    clearTranscripts();

    const sessionId = manager.getState().sessionId;
    if (sessionId) announceMemoryReset(sessionId);
  }, [announceMemoryReset, clearTranscripts, memoryManagerRef, seededFacts]);

  const memoryFacts: MemoryFact[] = deps.sessionFacts.map((f) => ({
    id: f.id,
    category: f.category,
    content: f.content,
    timestamp: new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  return { addMemoryFact, deleteMemoryFact, clearAllMemory, memoryFacts };
}
