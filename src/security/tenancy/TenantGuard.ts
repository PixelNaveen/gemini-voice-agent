import { TenantContext, DEFAULT_TENANT } from './TenantContext';

export class TenantGuard {
  private static tenants: Map<string, TenantContext> = new Map([
    [DEFAULT_TENANT.tenantId, DEFAULT_TENANT],
  ]);

  public static registerTenant(tenant: TenantContext): void {
    this.tenants.set(tenant.tenantId, tenant);
  }

  public static getTenant(tenantId: string): TenantContext | null {
    return this.tenants.get(tenantId) || null;
  }

  /**
   * Asserts that a resource is owned by the requested tenantId.
   */
  public static assertOwnership(
    resourceTenantId: string,
    requestTenantId: string,
    resourceType = 'Resource'
  ): void {
    if (!resourceTenantId || resourceTenantId !== requestTenantId) {
      const err = new Error(
        `[TenantGuard] Cross-tenant access denied: ${resourceType} owned by ${resourceTenantId}, requested by ${requestTenantId}`
      );
      (err as any).code = 'TENANT_ISOLATION_VIOLATION';
      throw err;
    }
  }

  /**
   * Validates if a persona is authorized for a given tenant.
   */
  public static isPersonaAllowed(tenantId: string, personaId: string): boolean {
    const tenant = this.getTenant(tenantId);
    if (!tenant || tenant.status !== 'ACTIVE') return false;
    return tenant.allowedPersonas.includes(personaId);
  }
}
