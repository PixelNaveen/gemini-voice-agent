import { ConversationIntent } from './Intent';
import { ConversationEntities } from './Entities';

export type ConversationState =
  | 'IDLE'
  | 'UNDERSTANDING_REQUEST'
  | 'IDENTIFYING_SERVICE'
  | 'CHECKING_AVAILABILITY'
  | 'SELECTING_SLOT'
  | 'COLLECTING_CUSTOMER_INFO'
  | 'VERIFYING_INFORMATION'
  | 'FINAL_CONFIRMATION'
  | 'EXECUTING_ACTION'
  | 'POST_ACTION'
  | 'CLOSING';

export type TaskStatus = 'ACTIVE' | 'PENDING' | 'COMPLETED';

export interface ConversationTask {
  id: string;
  intent: ConversationIntent;
  priority: number;
  status: TaskStatus;
  label?: string;
}

export interface PendingAction {
  type: 'BOOK_APPOINTMENT' | 'CANCEL_APPOINTMENT' | 'RESCHEDULE_APPOINTMENT' | 'CAPTURE_LEAD' | 'CUSTOM';
  payload: Record<string, any>;
  isConfirmed: boolean;
  actionId?: string;
}

export interface StateTransitionLog {
  from: ConversationState;
  to: ConversationState;
  reason: string;
  timestamp: number;
}

export interface ConversationRuntimeState {
  intent: ConversationIntent | null;
  state: ConversationState;
  entities: ConversationEntities;
  tasks: ConversationTask[];
  pendingAction: PendingAction | null;
  lastTransitionReason?: string;
  transitionHistory: StateTransitionLog[];
}

export const INITIAL_CONVERSATION_STATE: ConversationRuntimeState = {
  intent: null,
  state: 'IDLE',
  entities: {},
  tasks: [],
  pendingAction: null,
  transitionHistory: [],
};
