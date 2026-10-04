import { TestHarness, TestResult } from '../TestHarness';
import { CustomerRepository } from '../../persistence/repositories/CustomerRepository';
import { TenantCache } from '../../persistence/cache/Cache';
import { CacheKey } from '../../persistence/cache/CacheKey';
import { MockN8nClient } from '../../tools/n8n/MockN8nClient';

export async function runTenantIsolationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const mockClient = MockN8nClient.getInstance();

  // Test 1: Cross-tenant customer privacy
  results.push(
    await TestHarness.runTest('TenantIsolation', 'Prevents cross-tenant customer record visibility', async () => {
      const email = `isolated_${Date.now()}@example.com`;

      // Customer created in Tenant A
      await CustomerRepository.save({
        id: `cust_a_${Date.now()}`,
        tenantId: 'tenant_aura_salon',
        firstName: 'Alice',
        lastName: 'Aura',
        email,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Query from Tenant A -> Found
      const foundInA = await CustomerRepository.findByEmail('tenant_aura_salon', email);
      TestHarness.assert(foundInA !== null, 'Customer should be found in owning tenant A');

      // Query from Tenant B -> Not Found
      const foundInB = await CustomerRepository.findByEmail('tenant_apex_dental', email);
      TestHarness.assert(foundInB === null, 'Customer must NOT be visible to Tenant B');
    })
  );

  // Test 2: Cache isolation by tenant key
  results.push(
    await TestHarness.runTest('TenantIsolation', 'Enforces tenant-prefixed cache isolation', () => {
      const keyA = CacheKey.forCustomer('tenant_aura_salon', 'cust_1');
      const keyB = CacheKey.forCustomer('tenant_apex_dental', 'cust_1');

      TenantCache.set<{ name: string }>(keyA, { name: 'Alice Aura' });
      TenantCache.set<{ name: string }>(keyB, { name: 'Bob Dental' });

      const valA = TenantCache.get<{ name: string }>(keyA);
      const valB = TenantCache.get<{ name: string }>(keyB);

      TestHarness.assertEqual(valA?.name, 'Alice Aura', 'Tenant A cache value preserved');
      TestHarness.assertEqual(valB?.name, 'Bob Dental', 'Tenant B cache value preserved');

      // Evict only Tenant A
      TenantCache.clearTenant('tenant_aura_salon');
      TestHarness.assert(TenantCache.get<{ name: string }>(keyA) === null, 'Tenant A cache cleared');
      TestHarness.assert(TenantCache.get<{ name: string }>(keyB) !== null, 'Tenant B cache untouched');
    })
  );

  // Test 3: Persona booking isolation & cross-persona boundary
  results.push(
    await TestHarness.runTest('TenantIsolation', 'Enforces strict persona-level booking and seededBusy isolation', async () => {
      mockClient.clear();

      // Create booking in aura-salon
      const bookingSalon = await mockClient.createAppointment({
        personaId: 'aura-salon',
        sessionId: 'sess_salon_1',
        requestId: 'req_salon_iso_1',
        serviceId: 'haircut',
        date: '2026-10-12',
        start: '11:00',
        customerName: 'Alice Salon',
        email: 'alice@example.com',
      });
      TestHarness.assert(bookingSalon.success === true, 'Salon booking succeeded');
      const salonCode = bookingSalon.confirmationCode!;

      // Lookup from apex-dental using salon's confirmation code -> must NOT be found
      const lookupFromDental = await mockClient.lookupAppointment({
        personaId: 'apex-dental',
        confirmationCode: salonCode,
      });
      TestHarness.assert(lookupFromDental.found === false, 'Salon booking must not be found in apex-dental scope');

      // Lookup from aura-salon -> found
      const lookupFromSalon = await mockClient.lookupAppointment({
        personaId: 'aura-salon',
        confirmationCode: salonCode,
      });
      TestHarness.assert(lookupFromSalon.found === true, 'Salon booking must be found in aura-salon scope');
    })
  );

  return results;
}
