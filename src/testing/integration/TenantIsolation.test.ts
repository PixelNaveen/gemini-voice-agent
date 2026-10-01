import { TestHarness, TestResult } from '../TestHarness';
import { CustomerRepository } from '../../persistence/repositories/CustomerRepository';
import { TenantCache } from '../../persistence/cache/Cache';
import { CacheKey } from '../../persistence/cache/CacheKey';

export async function runTenantIsolationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

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

  return results;
}
