import { AuditRecord } from '../models/AuditEvent';

export class AuditRepository {
  private static auditLogs: AuditRecord[] = [];

  public static async record(event: AuditRecord): Promise<AuditRecord> {
    this.auditLogs.push({ ...event });
    if (this.auditLogs.length > 500) {
      this.auditLogs.shift();
    }
    return event;
  }

  public static async listByTenant(tenantId: string, limit = 50): Promise<AuditRecord[]> {
    return this.auditLogs
      .filter((a) => a.tenantId === tenantId)
      .slice(-limit)
      .reverse();
  }
}
