import { getPool } from "@/lib/db/pool";

type CacheValue<T> = {
  value: T;
  expiresAt: number;
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export class TenantResolver {
  private readonly companyCache = new Map<string, CacheValue<{ id: string; name: string }>>();
  private readonly targetAppCache = new Map<string, CacheValue<{ id: string; name: string }>>();

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

  async resolveCompanyByName(companyName: string) {
    const normalized = normalizeName(companyName);
    if (!normalized) {
      throw new Error("companyName is required.");
    }

    const cached = this.getFromCache(this.companyCache, normalized);
    if (cached) return cached;

    const result = await getPool().query<{ id: string; name: string }>(
      `
        SELECT id, name
        FROM companies
        WHERE deleted_at IS NULL
          AND status = 'active'
          AND lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = $1
        LIMIT 1
      `,
      [normalized]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Company not found for name: ${companyName}`);
    }

    this.setCache(this.companyCache, normalized, row, this.companyTtlMs);
    return row;
  }

  async resolveTargetAppByName(companyId: string, targetAppName?: string) {
    const normalized = normalizeName(targetAppName || "");
    if (!normalized) {
      return null;
    }

    const cacheKey = `${companyId}:${normalized}`;
    const cached = this.getFromCache(this.targetAppCache, cacheKey);
    if (cached) return cached;

    let row: { id: string; name: string } | null = null;

    // Primary path for normalized schema (guided_workflow_target_apps -> company_target_applications).
    const primary = await getPool().query<{ id: string; name: string }>(
      `
        SELECT gta.id, cta.name
        FROM guided_workflow_target_apps gta
        INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
        WHERE cta.company_id = $1
          AND cta.deleted_at IS NULL
          AND gta.deleted_at IS NULL
          AND lower(regexp_replace(trim(cta.name), '\\s+', ' ', 'g')) = $2
        LIMIT 1
      `,
      [companyId, normalized]
    );

    row = primary.rows[0] || null;

    if (!row) {
      try {
        // Legacy fallback for older schemas where guided_workflow_target_apps carries name/company_id.
        const fallback = await getPool().query<{ id: string; name: string }>(
          `
            SELECT id, name
            FROM guided_workflow_target_apps
            WHERE company_id = $1
              AND (deleted_at IS NULL OR deleted_at > now())
              AND lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = $2
            LIMIT 1
          `,
          [companyId, normalized]
        );
        row = fallback.rows[0] || null;
      } catch {
        row = null;
      }
    }

    if (!row) {
      // Final fallback directly against canonical target app table.
      try {
        const canonical = await getPool().query<{ id: string; name: string }>(
          `
            SELECT id, name
            FROM company_target_applications
            WHERE company_id = $1
              AND deleted_at IS NULL
              AND lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = $2
            LIMIT 1
          `,
          [companyId, normalized]
        );

        const app = canonical.rows[0] || null;
        if (app) {
          // Convert canonical target app -> guided target app id when available.
          const mapped = await getPool().query<{ id: string }>(
            `
              SELECT id
              FROM guided_workflow_target_apps
              WHERE target_app_id = $1
                AND deleted_at IS NULL
              LIMIT 1
            `,
            [app.id]
          );

          const guided = mapped.rows[0];
          row = guided ? { id: guided.id, name: app.name } : null;
        }
      } catch {
        row = null;
      }
    }

    if (!row) {
      throw new Error(`Target app not found for name: ${targetAppName}`);
    }

    this.setCache(this.targetAppCache, cacheKey, row, this.targetAppTtlMs);
    return row;
  }
}
