import { AppointmentResponseDto } from '../../api/dto/AppointmentDtos';
import { CustomerDto } from '../../api/dto/CustomerDtos';
import { PersonaResponseDto } from '../../api/dto/PersonaDtos';
import { PersonaService } from '../../application/personas/PersonaService';
import { AppointmentRepository } from '../../persistence/repositories/AppointmentRepository';
import { CustomerRepository } from '../../persistence/repositories/CustomerRepository';

export interface ServerState {
  personas: PersonaResponseDto[];
  appointments: AppointmentResponseDto[];
  customers: CustomerDto[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
}

export class ServerStore {
  private static state: ServerState = {
    personas: [],
    appointments: [],
    customers: [],
    isLoading: false,
    error: null,
    lastFetchedAt: null,
  };

  private static listeners: ((state: ServerState) => void)[] = [];

  public static getState(): ServerState {
    return { ...this.state };
  }

  public static setState(partial: Partial<ServerState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[ServerStore] Listener error:', err);
      }
    }
  }

  public static subscribe(listener: (state: ServerState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public static async refresh(tenantId = 'tenant_aura_salon'): Promise<void> {
    this.setState({ isLoading: true, error: null });
    try {
      const personaList = PersonaService.listPersonas();
      const customers = await CustomerRepository.listByTenant(tenantId);
      const appointments = await AppointmentRepository.findByDate(tenantId, new Date().toISOString().split('T')[0]);

      this.setState({
        personas: personaList.personas,
        customers: customers.map((c) => ({
          id: c.id,
          tenantId: c.tenantId,
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Guest',
          email: c.email,
          phone: c.phone,
          createdAt: c.createdAt,
        })),
        appointments: appointments.map((a) => ({
          appointmentId: a.id,
          tenantId: a.tenantId,
          customerName: a.customerId,
          customerEmail: '',
          serviceName: a.serviceName,
          date: a.date,
          startTime: a.startTime,
          status: a.status,
          externalReference: a.externalAppointmentId,
          createdAt: a.createdAt,
        })),
        isLoading: false,
        lastFetchedAt: Date.now(),
      });
    } catch (err: any) {
      this.setState({
        isLoading: false,
        error: err.message || 'Failed to fetch server state.',
      });
    }
  }
}
