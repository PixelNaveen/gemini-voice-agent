import { ConversationRuntimeState, ConversationState, INITIAL_CONVERSATION_STATE } from './ConversationState';
import { ConversationEvent } from './ConversationEvents';
import { createEntity, DateTimeNormalizer } from '../entities';

/**
 * Validates whether all required booking prerequisites are satisfied.
 */
export function canEnterFinalConfirmation(state: ConversationRuntimeState): boolean {
  if (state.intent !== 'BOOKING' && state.intent !== 'RESCHEDULING') {
    return false;
  }
  const e = state.entities;
  const hasService = Boolean(e.service?.value);
  const hasDate = Boolean(e.date?.value?.iso || (typeof e.date?.value === 'string' && e.date.value));
  const hasTime = Boolean(e.time?.value?.time24 || (typeof e.time?.value === 'string' && e.time.value));
  const hasName = Boolean(e.customerName?.value);
  const hasEmail = Boolean(e.email?.value);

  return hasService && hasDate && hasTime && hasName && hasEmail;
}

/**
 * Determines the next logical conversation state based on entity completeness.
 */
export function evaluateNextState(state: ConversationRuntimeState): { nextState: ConversationState; reason: string } {
  const e = state.entities;

  if (!state.intent || state.intent === 'GENERAL_INQUIRY' || state.intent === 'PRICING' || state.intent === 'BUSINESS_INFORMATION') {
    return { nextState: state.intent ? 'UNDERSTANDING_REQUEST' : 'IDLE', reason: 'general_conversation' };
  }

  if (state.intent === 'BOOKING' || state.intent === 'RESCHEDULING') {
    if (!e.service?.value) {
      return { nextState: 'IDENTIFYING_SERVICE', reason: 'service_required' };
    }
    if (!e.date?.value || !e.time?.value) {
      return { nextState: 'CHECKING_AVAILABILITY', reason: 'slot_or_date_required' };
    }
    if (!e.customerName?.value || !e.email?.value) {
      return { nextState: 'COLLECTING_CUSTOMER_INFO', reason: 'customer_contact_info_required' };
    }
    if (e.email?.status !== 'CONFIRMED') {
      return { nextState: 'VERIFYING_INFORMATION', reason: 'email_verification_pending' };
    }
    return { nextState: 'FINAL_CONFIRMATION', reason: 'all_required_booking_information_available' };
  }

  if (state.intent === 'CANCELLATION') {
    if (!e.customerName?.value && !e.email?.value) {
      return { nextState: 'COLLECTING_CUSTOMER_INFO', reason: 'identifier_required_for_cancellation' };
    }
    return { nextState: 'FINAL_CONFIRMATION', reason: 'ready_to_confirm_cancellation' };
  }

  return { nextState: state.state, reason: 'state_maintained' };
}

/**
 * Pure deterministic conversation state reducer.
 */
export function conversationReducer(
  state: ConversationRuntimeState,
  event: ConversationEvent
): ConversationRuntimeState {
  const previousState = state.state;

  switch (event.type) {
    case 'INTENT_DETECTED': {
      const updatedTasks = [...state.tasks];
      if (!updatedTasks.some((t) => t.intent === event.intent)) {
        updatedTasks.push({
          id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          intent: event.intent,
          priority: 1,
          status: 'ACTIVE',
        });
      }
      if (event.secondaryIntents) {
        for (const sec of event.secondaryIntents) {
          if (!updatedTasks.some((t) => t.intent === sec)) {
            updatedTasks.push({
              id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
              intent: sec,
              priority: 2,
              status: 'PENDING',
            });
          }
        }
      }

      const tempState: ConversationRuntimeState = {
        ...state,
        intent: event.intent,
        tasks: updatedTasks,
      };

      const { nextState, reason } = evaluateNextState(tempState);
      return recordTransition(tempState, previousState, nextState, event.reason || reason);
    }

    case 'ENTITY_CAPTURED': {
      const updatedEntities = {
        ...state.entities,
        [event.entity]: createEntity(event.value, 0.9, event.status || 'CONFIRMED'),
      };
      const tempState: ConversationRuntimeState = {
        ...state,
        entities: updatedEntities,
      };

      const { nextState, reason } = evaluateNextState(tempState);
      return recordTransition(tempState, previousState, nextState, event.reason || reason);
    }

    case 'ENTITIES_UPDATED': {
      const tempState: ConversationRuntimeState = {
        ...state,
        entities: { ...state.entities, ...event.entities },
      };

      const { nextState, reason } = evaluateNextState(tempState);
      return recordTransition(
        tempState,
        previousState,
        nextState,
        event.corrections && event.corrections.length > 0
          ? `entity_corrections: ${event.corrections.join(', ')}`
          : reason
      );
    }

    case 'AVAILABILITY_CHECK_REQUESTED': {
      return recordTransition(
        state,
        previousState,
        'CHECKING_AVAILABILITY',
        event.reason || 'availability_query_started'
      );
    }

    case 'SLOTS_OFFERED': {
      return recordTransition(
        state,
        previousState,
        'SELECTING_SLOT',
        event.reason || `slots_offered: ${event.slots.join(', ')}`
      );
    }

    case 'SLOT_SELECTED': {
      const normalizedTime = DateTimeNormalizer.normalizeTime(event.slot) || {
        time24: event.slot,
        display: event.slot,
      };
      const updatedEntities = {
        ...state.entities,
        time: createEntity(normalizedTime, 0.95, 'CONFIRMED'),
      };
      const tempState = { ...state, entities: updatedEntities };
      const { nextState, reason } = evaluateNextState(tempState);
      return recordTransition(tempState, previousState, nextState, event.reason || reason);
    }

    case 'CUSTOMER_INFO_COLLECTED': {
      const updatedEntities = { ...state.entities };
      if (event.name) updatedEntities.customerName = createEntity(event.name, 0.95, 'CONFIRMED');
      if (event.email) updatedEntities.email = createEntity(event.email, 0.98, 'CONFIRMED');
      if (event.phone) updatedEntities.phone = createEntity(event.phone, 0.95, 'CONFIRMED');

      const tempState = { ...state, entities: updatedEntities };
      const { nextState, reason } = evaluateNextState(tempState);
      return recordTransition(tempState, previousState, nextState, event.reason || reason);
    }

    case 'VERIFICATION_REQUESTED': {
      return recordTransition(
        state,
        previousState,
        'VERIFYING_INFORMATION',
        event.reason || `verifying_${event.target}`
      );
    }

    case 'VERIFICATION_CONFIRMED': {
      const updatedEntities = { ...state.entities };
      if (updatedEntities.email) {
        updatedEntities.email = { ...updatedEntities.email, status: 'CONFIRMED' };
      }
      const tempState = { ...state, entities: updatedEntities };
      const { nextState, reason } = evaluateNextState(tempState);
      return recordTransition(tempState, previousState, nextState, event.reason || reason);
    }

    case 'FINAL_CONFIRMATION_REQUESTED': {
      return recordTransition(
        state,
        previousState,
        'FINAL_CONFIRMATION',
        event.reason || 'ready_for_user_final_approval'
      );
    }

    case 'ACTION_EXECUTION_REQUESTED': {
      return recordTransition(
        { ...state, pendingAction: event.action },
        previousState,
        'EXECUTING_ACTION',
        event.reason || `executing_${event.action.type}`
      );
    }

    case 'ACTION_EXECUTION_SUCCEEDED': {
      const completedTasks = state.tasks.map((t) =>
        t.status === 'ACTIVE' ? { ...t, status: 'COMPLETED' as const } : t
      );
      return recordTransition(
        { ...state, pendingAction: null, tasks: completedTasks },
        previousState,
        'POST_ACTION',
        event.reason || 'action_completed_successfully'
      );
    }

    case 'ACTION_EXECUTION_FAILED': {
      return recordTransition(
        { ...state, pendingAction: null },
        previousState,
        'UNDERSTANDING_REQUEST',
        event.reason || `action_failed: ${event.error}`
      );
    }

    case 'SECONDARY_TASK_ADDED': {
      return {
        ...state,
        tasks: [...state.tasks, event.task],
      };
    }

    case 'TASK_COMPLETED': {
      const updatedTasks = state.tasks.map((t) =>
        t.id === event.taskId ? { ...t, status: 'COMPLETED' as const } : t
      );
      const hasActive = updatedTasks.some((t) => t.status === 'ACTIVE');
      if (!hasActive) {
        const nextPending = updatedTasks.find((t) => t.status === 'PENDING');
        if (nextPending) {
          nextPending.status = 'ACTIVE';
        }
      }
      return { ...state, tasks: updatedTasks };
    }

    case 'RESET_CONVERSATION': {
      return INITIAL_CONVERSATION_STATE;
    }

    default:
      return state;
  }
}

function recordTransition(
  state: ConversationRuntimeState,
  from: ConversationState,
  to: ConversationState,
  reason: string
): ConversationRuntimeState {
  if (from === to) {
    return { ...state, state: to, lastTransitionReason: reason };
  }

  const newLog = {
    from,
    to,
    reason,
    timestamp: Date.now(),
  };

  console.log(`[Conversation State] ${from} -> ${to} | Reason: ${reason}`);

  return {
    ...state,
    state: to,
    lastTransitionReason: reason,
    transitionHistory: [...state.transitionHistory, newLog],
  };
}
