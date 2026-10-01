import { ConversationIntent } from './Intent';
import { ConversationEntities } from './Entities';
import { ConversationTask, PendingAction } from './ConversationState';

export type ConversationEvent =
  | { type: 'INTENT_DETECTED'; intent: ConversationIntent; secondaryIntents?: ConversationIntent[]; reason?: string }
  | { type: 'ENTITY_CAPTURED'; entity: keyof ConversationEntities; value: any; status?: 'TENTATIVE' | 'CONFIRMED'; reason?: string }
  | { type: 'ENTITIES_UPDATED'; entities: ConversationEntities; corrections?: string[] }
  | { type: 'AVAILABILITY_CHECK_REQUESTED'; reason?: string }
  | { type: 'SLOTS_OFFERED'; slots: string[]; reason?: string }
  | { type: 'SLOT_SELECTED'; slot: string; reason?: string }
  | { type: 'CUSTOMER_INFO_COLLECTED'; name?: string; email?: string; phone?: string; reason?: string }
  | { type: 'VERIFICATION_REQUESTED'; target: 'email' | 'phone' | 'summary'; reason?: string }
  | { type: 'VERIFICATION_CONFIRMED'; reason?: string }
  | { type: 'FINAL_CONFIRMATION_REQUESTED'; reason?: string }
  | { type: 'ACTION_EXECUTION_REQUESTED'; action: PendingAction; reason?: string }
  | { type: 'ACTION_EXECUTION_SUCCEEDED'; result: any; reason?: string }
  | { type: 'ACTION_EXECUTION_FAILED'; error: string; reason?: string }
  | { type: 'SECONDARY_TASK_ADDED'; task: ConversationTask }
  | { type: 'TASK_COMPLETED'; taskId: string }
  | { type: 'RESET_CONVERSATION' };
