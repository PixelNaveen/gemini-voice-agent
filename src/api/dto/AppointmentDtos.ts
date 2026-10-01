export interface CreateAppointmentRequestDto {
  tenantId: string;
  sessionId: string;
  serviceId: string;
  serviceName: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  date: string;
  time: string;
  idempotencyKey?: string;
}

export interface AppointmentResponseDto {
  appointmentId: string;
  tenantId: string;
  customerName: string;
  customerEmail: string;
  serviceName: string;
  date: string;
  startTime: string;
  status: string;
  externalReference?: string;
  createdAt: number;
}

export interface AvailabilityQueryDto {
  tenantId: string;
  date: string;
  serviceId?: string;
}

export interface AvailabilityResponseDto {
  tenantId: string;
  date: string;
  availableSlots: string[];
  timezone: string;
  retrievedAt: number;
}
