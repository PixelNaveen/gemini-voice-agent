import { ConversationEntities } from './EntityModel';

export interface InvalidationResult {
  invalidatedKeys: string[];
  reason: string;
}

export class DependencyResolver {
  /**
   * Evaluates if changing an entity invalidates downstream dependent state.
   */
  public static checkInvalidations(
    previous: ConversationEntities,
    current: ConversationEntities
  ): InvalidationResult[] {
    const results: InvalidationResult[] = [];

    // 1. Service changed
    if (
      previous.service?.value &&
      current.service?.value &&
      previous.service.value.toLowerCase() !== current.service.value.toLowerCase()
    ) {
      results.push({
        invalidatedKeys: ['quotedPrice', 'availability', 'selectedSlot'],
        reason: `Service changed from "${previous.service.value}" to "${current.service.value}"`,
      });
    }

    // 2. Date changed
    if (
      previous.date?.value &&
      current.date?.value &&
      previous.date.value.iso !== current.date.value.iso
    ) {
      results.push({
        invalidatedKeys: ['availability', 'selectedSlot'],
        reason: `Appointment date changed from "${previous.date.value.display}" to "${current.date.value.display}"`,
      });
    }

    // 3. Time changed
    if (
      previous.time?.value &&
      current.time?.value &&
      previous.time.value.time24 !== current.time.value.time24
    ) {
      results.push({
        invalidatedKeys: ['selectedSlot'],
        reason: `Appointment time changed from "${previous.time.value.display}" to "${current.time.value.display}"`,
      });
    }

    return results;
  }
}
