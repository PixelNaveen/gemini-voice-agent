import { Customer } from '../models/Customer';

export class CustomerRepository {
  private static customers: Map<string, Customer> = new Map();

  public static async findByEmail(tenantId: string, email: string): Promise<Customer | null> {
    const normEmail = email.toLowerCase().trim();
    for (const c of this.customers.values()) {
      if (c.tenantId === tenantId && c.email?.toLowerCase().trim() === normEmail) {
        return { ...c };
      }
    }
    return null;
  }

  public static async findById(tenantId: string, id: string): Promise<Customer | null> {
    const c = this.customers.get(id);
    if (c && c.tenantId === tenantId) {
      return { ...c };
    }
    return null;
  }

  public static async save(customer: Customer): Promise<Customer> {
    const updated = {
      ...customer,
      updatedAt: Date.now(),
    };
    this.customers.set(customer.id, updated);
    return updated;
  }

  public static async listByTenant(tenantId: string): Promise<Customer[]> {
    return Array.from(this.customers.values()).filter((c) => c.tenantId === tenantId);
  }
}
