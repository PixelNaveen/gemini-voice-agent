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
    'torque-motors',
    'dr-clarke-dental',
    'pro-flow-hvac',
    'summit-law',
    'apex-physio',
  ],
  createdAt: 1700000000000,
};
