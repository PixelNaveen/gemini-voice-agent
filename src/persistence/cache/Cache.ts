interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
}

export class TenantCache {
  private static store: Map<string, CacheEntry<any>> = new Map();

  public static set<T>(key: string, value: T, ttlMs?: number): void {
    const entry: CacheEntry<T> = {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    };
    this.store.set(key, entry);
  }

  public static get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  public static delete(key: string): void {
    this.store.delete(key);
  }

  public static clearTenant(tenantId: string): void {
    const prefix = `tenant:${tenantId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  public static clearAll(): void {
    this.store.clear();
  }
}
