import { CustomerMemoryRecord } from '../models/CustomerMemory';

export class CustomerMemoryRepository {
  private static memories: Map<string, CustomerMemoryRecord> = new Map();

  public static async findByCustomer(tenantId: string, customerId: string): Promise<CustomerMemoryRecord[]> {
    const list: CustomerMemoryRecord[] = [];
    const now = Date.now();
    for (const m of this.memories.values()) {
      if (m.tenantId === tenantId && m.customerId === customerId) {
        if (!m.expiresAt || m.expiresAt > now) {
          list.push({ ...m });
        }
      }
    }
    return list;
  }

  public static async save(memory: CustomerMemoryRecord): Promise<CustomerMemoryRecord> {
    this.memories.set(memory.id, { ...memory });
    return memory;
  }

  public static async delete(tenantId: string, id: string): Promise<boolean> {
    const m = this.memories.get(id);
    if (m && m.tenantId === tenantId) {
      this.memories.delete(id);
      return true;
    }
    return false;
  }
}
