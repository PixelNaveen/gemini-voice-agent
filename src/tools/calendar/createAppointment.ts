import { ToolExecutionContext, ToolResult } from '../ToolTypes';
import { getN8nClient } from '../n8n/N8nClientFactory';
import { CreateAppointmentOutput } from '../n8n/N8nClient';

export async function createAppointmentTool(
  context: ToolExecutionContext,
  input: {
    requestId?: string;
    serviceId: string;
    date: string;
    start: string;
    resourceId?: string;
    customerName: string;
    email: string;
    phone?: string;
    partySize?: number;
    vehicleInfo?: string;
    notes?: string;
  }
): Promise<ToolResult<CreateAppointmentOutput>> {
  const client = getN8nClient();
  const requestId = input.requestId || context.operationId;

  const res = await client.createAppointment({
    personaId: context.personaId,
    sessionId: context.sessionId,
    requestId,
    serviceId: input.serviceId,
    date: input.date,
    start: input.start,
    resourceId: input.resourceId,
    customerName: input.customerName,
    email: input.email,
    phone: input.phone,
    partySize: input.partySize,
    vehicleInfo: input.vehicleInfo,
    notes: input.notes,
  });

  if (!res.success) {
    return {
      success: false,
      toolName: 'createAppointment',
      operationId: context.operationId,
      status: 'FAILED',
      error: {
        code: (res.errorCode as any) || 'CONFLICT',
        message: res.message || 'Failed to create appointment.',
      },
      data: res,
      executedAt: Date.now(),
    };
  }

  return {
    success: true,
    toolName: 'createAppointment',
    operationId: context.operationId,
    status: 'SUCCESS',
    data: res,
    executedAt: Date.now(),
  };
}
