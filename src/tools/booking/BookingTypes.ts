export type BookingStateMachineStage =
  | 'IDLE'
  | 'REQUESTED'
  | 'SERVICE_RESOLVED'
  | 'DATE_TIME_RESOLVED'
  | 'RULES_VALIDATED'
  | 'AVAILABILITY_CHECKED'
  | 'SLOT_SELECTED'
  | 'CUSTOMER_IDENTIFIED'
  | 'CONFIRMATION_PENDING'
  | 'RESERVING'
  | 'CREATING'
  | 'VERIFYING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'NEEDS_RECONCILIATION';

export interface BookingCandidate {
  serviceId?: string;
  serviceName?: string;
  isoDate?: string;
  displayDate?: string;
  time24?: string;
  displayTime?: string;
  timezone: string;
  durationMinutes: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  partySize?: number;
  vehicleInfo?: string;
  status: 'TENTATIVE' | 'CONFIRMED';
}

export type BookingOperationType = 'CREATE' | 'CANCEL' | 'RESCHEDULE';

export type BookingOperationStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNKNOWN'
  | 'RECONCILING';

export interface BookingOperation {
  operationId: string;
  sessionId: string;
  personaId: string;
  type: BookingOperationType;
  status: BookingOperationStatus;
  idempotencyKey: string;
  payload: Record<string, any>;
  result?: Record<string, any>;
  error?: string;
  createdAt: number;
  updatedAt: number;
}
