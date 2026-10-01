export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'PROVISIONING' | 'DEACTIVATED';

export interface Tenant {
  id: string;
  name: string;
  status: TenantStatus;
  timezone: string;
  createdAt: number;
  updatedAt: number;
}
