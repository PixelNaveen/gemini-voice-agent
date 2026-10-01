export class CacheKey {
  public static forPersona(tenantId: string, personaKey: string, version = 'latest'): string {
    return `tenant:${tenantId}:persona:${personaKey}:v${version}`;
  }

  public static forCustomer(tenantId: string, customerId: string): string {
    return `tenant:${tenantId}:customer:${customerId}`;
  }

  public static forAvailability(tenantId: string, date: string): string {
    return `tenant:${tenantId}:availability:${date}`;
  }

  public static forSession(tenantId: string, sessionId: string): string {
    return `tenant:${tenantId}:session:${sessionId}`;
  }
}
