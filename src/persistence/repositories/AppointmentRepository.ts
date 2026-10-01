import { AppointmentEntity } from '../models/Appointment';

export class AppointmentRepository {
  private static appointments: Map<string, AppointmentEntity> = new Map();

  public static async findById(tenantId: string, id: string): Promise<AppointmentEntity | null> {
    const apt = this.appointments.get(id);
    if (apt && apt.tenantId === tenantId) {
      return { ...apt };
    }
    return null;
  }

  public static async findByCustomer(tenantId: string, customerId: string): Promise<AppointmentEntity[]> {
    return Array.from(this.appointments.values()).filter(
      (a) => a.tenantId === tenantId && a.customerId === customerId
    );
  }

  public static async findByDate(tenantId: string, date: string): Promise<AppointmentEntity[]> {
    return Array.from(this.appointments.values()).filter(
      (a) => a.tenantId === tenantId && a.date === date && a.status !== 'CANCELLED'
    );
  }

  public static async save(appointment: AppointmentEntity): Promise<AppointmentEntity> {
    const updated: AppointmentEntity = {
      ...appointment,
      updatedAt: Date.now(),
    };
    this.appointments.set(appointment.id, updated);
    return updated;
  }
}
