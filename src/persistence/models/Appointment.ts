export type AppointmentDbStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'RESCHEDULED'
  | 'COMPLETED';

export interface AppointmentEntity {
  id: string;
  tenantId: string;
  customerId: string;
  serviceId: string;
  serviceName: string;
  date: string;
  startTime: string;
  endTime?: string;
  timezone: string;
  status: AppointmentDbStatus;
  notes?: string;
  externalProvider?: string;
  externalAppointmentId?: string;
  createdAt: number;
  updatedAt: number;
}
