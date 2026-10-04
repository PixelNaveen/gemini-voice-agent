export interface TenantContext {
  tenantId: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PROVISIONING';
  allowedPersonas: string[];
  createdAt: number;
}

export const DEFAULT_TENANT: TenantContext = {
  tenantId: 'tenant_aura_default',
  name: 'AURA Enterprise Demo Tenant',
  status: 'ACTIVE',
  allowedPersonas: [
    'aura-salon',
    'apex-dental',
    'torque-motors',
    'grand-realty',
    'vanguard-law',
    'bistro-dining',
    'coolbreeze-hvac',
  ],
  createdAt: 1700000000000,
};
