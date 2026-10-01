import { CreateAppointmentRequestDto } from '../dto/AppointmentDtos';
import { CreateSessionRequestDto } from '../dto/SessionDtos';
import { AuraError, ErrorCode } from '../../core/errors';

export class DtoValidator {
  public static validateCreateSession(payload: unknown): CreateSessionRequestDto {
    if (!payload || typeof payload !== 'object') {
      throw new AuraError({
        code: ErrorCode.PERSONA_INVALID,
        category: 'FATAL',
        source: 'SYSTEM',
        message: 'Invalid session creation request payload.',
        retryable: false,
      });
    }

    const data = payload as any;
    if (!data.tenantId || typeof data.tenantId !== 'string') {
      throw new AuraError({
        code: ErrorCode.PERSONA_INVALID,
        category: 'FATAL',
        source: 'SYSTEM',
        message: 'Missing or invalid tenantId in session request.',
        retryable: false,
      });
    }

    if (!data.personaId || typeof data.personaId !== 'string') {
      throw new AuraError({
        code: ErrorCode.PERSONA_INVALID,
        category: 'FATAL',
        source: 'SYSTEM',
        message: 'Missing or invalid personaId in session request.',
        retryable: false,
      });
    }

    return {
      tenantId: data.tenantId,
      personaId: data.personaId,
      userId: data.userId,
      metadata: data.metadata,
    };
  }

  public static validateCreateAppointment(payload: unknown): CreateAppointmentRequestDto {
    if (!payload || typeof payload !== 'object') {
      throw new AuraError({
        code: ErrorCode.TOOL_VALIDATION_ERROR,
        category: 'BUSINESS_FAILURE',
        source: 'TOOL',
        message: 'Invalid appointment request body.',
        retryable: false,
      });
    }

    const data = payload as any;
    if (!data.tenantId || typeof data.tenantId !== 'string') {
      throw new AuraError({
        code: ErrorCode.TOOL_VALIDATION_ERROR,
        category: 'BUSINESS_FAILURE',
        source: 'TOOL',
        message: 'Missing required tenantId.',
        retryable: false,
      });
    }

    if (!data.customerEmail || !data.customerEmail.includes('@')) {
      throw new AuraError({
        code: ErrorCode.TOOL_VALIDATION_ERROR,
        category: 'BUSINESS_FAILURE',
        source: 'TOOL',
        message: 'Invalid customer email address provided.',
        retryable: false,
      });
    }

    if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      throw new AuraError({
        code: ErrorCode.TOOL_VALIDATION_ERROR,
        category: 'BUSINESS_FAILURE',
        source: 'TOOL',
        message: 'Invalid date format. Expected YYYY-MM-DD.',
        retryable: false,
      });
    }

    return {
      tenantId: data.tenantId,
      sessionId: data.sessionId || 'anonymous',
      serviceId: data.serviceId || 'default',
      serviceName: data.serviceName || 'General Service',
      customerName: data.customerName || 'Valued Guest',
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      date: data.date,
      time: data.time || '10:00',
      idempotencyKey: data.idempotencyKey,
    };
  }
}
