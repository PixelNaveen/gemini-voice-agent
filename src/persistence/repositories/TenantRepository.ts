import { Tenant } from '../models/Tenant';

export class TenantRepository {
  private static tenants: Map<string, Tenant> = new Map([
    [
      'tenant_aura_salon',
      {
        id: 'tenant_aura_salon',
        name: 'AURA Luxury Salon & Spa',
        status: 'ACTIVE',
        timezone: 'Asia/Colombo',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    [
      'tenant_apex_dental',
      {
        id: 'tenant_apex_dental',
        name: 'Apex Dental & Orthodontics',
        status: 'ACTIVE',
        timezone: 'America/New_York',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    [
      'tenant_torque_motors',
      {
        id: 'tenant_torque_motors',
        name: 'Torque Motors & Auto Care',
        status: 'ACTIVE',
        timezone: 'America/Chicago',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  ]);

  public static async findById(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) || null;
  }

  public static async save(tenant: Tenant): Promise<Tenant> {
    this.tenants.set(tenant.id, { ...tenant, updatedAt: Date.now() });
    return tenant;
  }

  public static async listAll(): Promise<Tenant[]> {
    return Array.from(this.tenants.values());
  }
}
