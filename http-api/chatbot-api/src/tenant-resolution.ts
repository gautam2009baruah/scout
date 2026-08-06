import { getPool } from "@/lib/db/pool";

type CacheValue<T> = {
  value: T;
  expiresAt: number;
};

export class TenantResolver {
  private readonly targetAppCache = new Map<string, CacheValue<{ id: string; name: string; companyId: string; companyName: string }>>();

  constructor(
    private readonly companyTtlMs: number,
    private readonly targetAppTtlMs: number
  ) {}

  private getFromCache<T>(store: Map<string, CacheValue<T>>, key: string): T | null {
    const found = store.get(key);
    if (!found) return null;
    if (Date.now() > found.expiresAt) {
      store.delete(key);
      return null;
    }
    return found.value;
  }

  private setCache<T>(store: Map<string, CacheValue<T>>, key: string, value: T, ttlMs: number) {
    store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  async resolveTargetAppById(targetAppId: string) {
    const cached = this.getFromCache(this.targetAppCache, targetAppId);
    if (cached) return cached;

    const result = await getPool().query<{ id: string; name: string; company_id: string; company_name: string }>(
      `
        SELECT
          cta.id,
          cta.name,
          c.id AS company_id,
          c.name AS company_name
        FROM company_target_applications cta
        INNER JOIN companies c ON c.id = cta.company_id
        WHERE cta.id = $1
          AND cta.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND c.status = 'active'
        LIMIT 1
      `,
      [targetAppId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Target app not found for id: ${targetAppId}`);
    }

    const value = { id: row.id, name: row.name, companyId: row.company_id, companyName: row.company_name };
    this.setCache(this.targetAppCache, targetAppId, value, Math.min(this.companyTtlMs, this.targetAppTtlMs));
    return value;
  }
}
