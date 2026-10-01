import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { CalendarAdapter, AppointmentRecord } from '../../integrations/calendar/CalendarAdapter';
import { BookingValidator } from './BookingValidator';
import { IdempotencyService } from './IdempotencyService';
import { BookingOperation } from './BookingTypes';

export interface ExecuteBookingInput {
  service: string;
  isoDate: string;
  time24: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  vehicleInfo?: string;
  partySize?: number;
}

export class BookingService {
  /**
   * Authoritative, idempotent appointment creation transaction.
   */
  public static async executeBooking(
    context: ToolExecutionContext,
    input: ExecuteBookingInput
  ): Promise<ToolResult<{ appointment: AppointmentRecord }>> {
    const idempotencyKey = context.idempotencyKey || `${context.sessionId}_${context.operationId}`;

    // 1. Idempotency Cache Check
    const existingOp = IdempotencyService.getOperation(idempotencyKey);
    if (existingOp && existingOp.status === 'SUCCEEDED' && existingOp.result) {
      console.log(`[BookingService] Idempotent hit: returning cached confirmed appointment.`);
      return {
        success: true,
        toolName: 'createAppointment',
        operationId: context.operationId,
        status: 'CONFIRMED',
        data: { appointment: existingOp.result as AppointmentRecord },
        executedAt: Date.now(),
      };
    }

    // F-39: an operation that started but never finished is genuinely ambiguous, and this is
    // where that gets resolved rather than guessed.
    //
    // Reaching `EXECUTING` and then losing the process used to be indistinguishable from never
    // having started, so nothing was ever able to say "we do not know what happened here". Now
    // that the operation is durable, a retry can see the gap. The outcome is not invented: the
    // step below re-enters `CalendarAdapter`, whose own idempotency lookup under this same key
    // is the authority. If the booking landed, the retry returns it; if it did not, the retry
    // books it. Either way the caller ends with a real record rather than a fabricated one.
    if (existingOp && existingOp.status !== 'FAILED') {
      IdempotencyService.updateOperationStatus(idempotencyKey, 'RECONCILING');
      console.log(
        `[BookingService] Reconciling operation ${idempotencyKey} left in ${existingOp.status} by a previous attempt.`
      );
    }

    // 2. Register Pending Operation in Ledger
    const operation: BookingOperation = {
      operationId: context.operationId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      type: 'CREATE',
      status: 'PENDING',
      idempotencyKey,
      payload: input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    IdempotencyService.registerOperation(operation);

    // 3. Entity & Policy Validation
    const validation = BookingValidator.validate({
      personaId: context.personaId,
      service: input.service,
      isoDate: input.isoDate,
      time24: input.time24,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      vehicleInfo: input.vehicleInfo,
      partySize: input.partySize,
    });

    if (!validation.valid) {
      IdempotencyService.updateOperationStatus(idempotencyKey, 'FAILED', undefined, validation.errors.join(' '));
      return {
        success: false,
        toolName: 'createAppointment',
        operationId: context.operationId,
        status: 'FAILED',
        error: { code: 'VALIDATION_ERROR', message: validation.errors.join(' ') },
        executedAt: Date.now(),
      };
    }

    // 4. Authorization Guard (Final user confirmation required)
    if (context.isConfirmedByUser === false) {
      IdempotencyService.updateOperationStatus(idempotencyKey, 'FAILED', undefined, 'Missing caller confirmation.');
      return {
        success: false,
        toolName: 'createAppointment',
        operationId: context.operationId,
        status: 'FAILED',
        error: {
          code: 'AUTHORIZATION_ERROR',
          message: 'Appointment booking requires explicit final confirmation before transaction execution.',
        },
        executedAt: Date.now(),
      };
    }

    // 5. Atomic Execution via Calendar Adapter
    IdempotencyService.updateOperationStatus(idempotencyKey, 'EXECUTING');

    const result = CalendarAdapter.createAppointment({
      personaId: context.personaId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      service: input.service,
      date: input.isoDate,
      startTime: input.time24,
      idempotencyKey,
    });

    if (!result.success || !result.appointment) {
      const isConflict = result.error?.includes('CONFLICT');
      IdempotencyService.updateOperationStatus(idempotencyKey, 'FAILED', undefined, result.error);
      return {
        success: false,
        toolName: 'createAppointment',
        operationId: context.operationId,
        status: isConflict ? 'CONFLICT' : 'FAILED',
        error: {
          code: isConflict ? 'CONFLICT' : 'INTEGRATION_ERROR',
          message: result.error || 'Failed to book appointment in calendar.',
        },
        executedAt: Date.now(),
      };
    }

    // 6. Record Success in Ledger
    IdempotencyService.updateOperationStatus(idempotencyKey, 'SUCCEEDED', result.appointment);

    return {
      success: true,
      toolName: 'createAppointment',
      operationId: context.operationId,
      status: 'CONFIRMED',
      data: { appointment: result.appointment },
      executedAt: Date.now(),
    };
  }
}
