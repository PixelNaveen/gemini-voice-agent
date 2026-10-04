export interface CheckAvailabilityInput {
  personaId: string;
  serviceId?: string;
  date: string;
  time?: string;
  window?: { start: string; end: string };
  partySize?: number;
  resourceId?: string;
  nextWeekdayPolicy?: 'ask' | 'upcoming' | 'following_week';
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  resourceId: string;
  resourceName: string;
}

export interface CheckAvailabilityOutput {
  available: boolean;
  slots: AvailabilitySlot[];
  reason?: string;
  date?: string;
  weekday?: string;
  needsConfirmation?: boolean;
  candidates?: string[];
}

export interface FindAlternativeTimesInput extends CheckAvailabilityInput {}

export interface AlternativeSlot {
  date: string;
  start: string;
  end: string;
  resourceId: string;
  resourceName: string;
}

export interface FindAlternativeTimesOutput {
  alternatives: AlternativeSlot[];
  reason?: string;
}

export interface CreateAppointmentInput {
  personaId: string;
  sessionId: string;
  requestId: string;
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

export interface AppointmentRecord {
  id: string;
  confirmationCode: string;
  personaId: string;
  sessionId: string;
  requestId: string;
  serviceId: string;
  serviceName: string;
  date: string;
  start: string;
  end: string;
  resourceId: string;
  resourceName: string;
  customerName: string;
  email: string;
  phone?: string;
  partySize?: number;
  vehicleInfo?: string;
  notes?: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED';
  createdAt: number;
}

export type EmailDeliveryStatus = 'sent' | 'failed' | 'not_configured';

export interface CreateAppointmentOutput {
  success: boolean;
  confirmationCode?: string;
  appointment?: AppointmentRecord;
  emailStatus?: EmailDeliveryStatus;
  errorCode?: string;
  message?: string;
}

export interface LookupAppointmentInput {
  personaId: string;
  sessionId?: string;
  confirmationCode?: string;
}

export interface LookupAppointmentOutput {
  found: boolean;
  appointment?: AppointmentRecord;
  message?: string;
}

export interface RescheduleAppointmentInput {
  personaId: string;
  sessionId: string;
  requestId: string;
  confirmationCode: string;
  newDate: string;
  newStart: string;
  resourceId?: string;
}

export interface RescheduleAppointmentOutput {
  success: boolean;
  confirmationCode?: string;
  appointment?: AppointmentRecord;
  emailStatus?: EmailDeliveryStatus;
  errorCode?: string;
  message?: string;
}

export interface CancelAppointmentInput {
  personaId: string;
  sessionId: string;
  requestId: string;
  confirmationCode: string;
  confirmed: boolean;
}

export interface CancelAppointmentOutput {
  success: boolean;
  confirmationCode?: string;
  emailStatus?: EmailDeliveryStatus;
  errorCode?: string;
  message?: string;
}

export interface N8nClient {
  checkAvailability(input: CheckAvailabilityInput): Promise<CheckAvailabilityOutput>;
  findAlternativeTimes(input: FindAlternativeTimesInput): Promise<FindAlternativeTimesOutput>;
  createAppointment(input: CreateAppointmentInput): Promise<CreateAppointmentOutput>;
  lookupAppointment(input: LookupAppointmentInput): Promise<LookupAppointmentOutput>;
  rescheduleAppointment(input: RescheduleAppointmentInput): Promise<RescheduleAppointmentOutput>;
  cancelAppointment(input: CancelAppointmentInput): Promise<CancelAppointmentOutput>;
}
