import { CustomerRepository } from '../../persistence/repositories/CustomerRepository';
import { CustomerMemoryRepository } from '../../persistence/repositories/CustomerMemoryRepository';
import { Customer } from '../../persistence/models/Customer';
import { CustomerDto, CustomerMemoryDto } from '../../api/dto/CustomerDtos';

export class CustomerService {
  public static async getOrCreateCustomer(tenantId: string, email: string, name?: string, phone?: string): Promise<Customer> {
    const existing = await CustomerRepository.findByEmail(tenantId, email);
    if (existing) {
      if (name && (!existing.firstName || !existing.lastName)) {
        const parts = name.split(' ');
        existing.firstName = parts[0];
        existing.lastName = parts.slice(1).join(' ') || undefined;
        if (phone && !existing.phone) existing.phone = phone;
        await CustomerRepository.save(existing);
      }
      return existing;
    }

    const parts = (name || '').split(' ');
    const newCustomer: Customer = {
      id: `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      firstName: parts[0] || 'Valued',
      lastName: parts.slice(1).join(' ') || 'Customer',
      email,
      phone,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return await CustomerRepository.save(newCustomer);
  }

  public static async getCustomerMemories(tenantId: string, customerId: string): Promise<CustomerMemoryDto[]> {
    const memories = await CustomerMemoryRepository.findByCustomer(tenantId, customerId);
    return memories.map((m) => ({
      id: m.id,
      customerId: m.customerId,
      category: m.category,
      fact: m.fact,
      value: m.value,
      confidence: m.confidence,
      createdAt: m.createdAt,
    }));
  }
}
