import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { adminAIProviderConfig, getAdminAIProviderConfig } from "@/lib/ai/config";
import { getPool } from "@/lib/db/pool";
import { enqueueDocumentReembeddingJobs } from "@/lib/admin/processing-jobs";

export const runtime = "nodejs";

type ConfigType = "embedding" | "llm";

const NULL_SCOPE_ID = "00000000-0000-0000-0000-000000000000";

function canAccessCompany(companyId: string, session: NonNullable<Awaited<ReturnType<typeof getCurrentAdminSession>>>) {
  return session.availableCompanies.some((company) => company.companyId === companyId);
}

function tableFor(type: ConfigType) {
  return type === "embedding" ? "ai_embedding_provider_configs" : "ai_llm_provider_configs";
}

// A config row scoped to a target app but no environment applies to that
// entire target app; scoped to neither applies company-wide. Validate the
// target app belongs to the company and the environment (if any) belongs to
// that target app, mirroring validateTargetAppIds in lib/admin/content-structure.ts.
async function resolveScope(companyId: string, rawTargetAppId: unknown, rawEnvironmentId: unknown): Promise<{ targetAppId: string | null; environmentId: string | null } | { message: string }> {
  const targetAppId = typeof rawTargetAppId === "string" && rawTargetAppId.trim() ? rawTargetAppId.trim() : null;
  const environmentId = typeof rawEnvironmentId === "string" && rawEnvironmentId.trim() ? rawEnvironmentId.trim() : null;

  if (!targetAppId) {
    return environmentId ? { message: "An environment requires a target app to be selected." } : { targetAppId: null, environmentId: null };
  }

  const targetAppResult = await getPool().query<{ id: string }>(
    `SELECT id FROM company_target_applications WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
    [targetAppId, companyId]
  );

  if (!targetAppResult.rowCount) {
    return { message: "Target app was not found for this company." };
  }

  if (!environmentId) {
    return { targetAppId, environmentId: null };
  }

  const environmentResult = await getPool().query<{ id: string }>(
    `SELECT id FROM target_app_environments WHERE id = $1 AND target_app_id = $2`,
    [environmentId, targetAppId]
  );

  if (!environmentResult.rowCount) {
    return { message: "Environment was not found for this target app." };
  }

  return { targetAppId, environmentId };
}

async function unPrimaryOthersInScope(type: ConfigType, companyId: string, targetAppId: string | null, environmentId: string | null, updatedBy: string) {
  await getPool().query(
    `
      UPDATE ${tableFor(type)}
      SET is_primary = false,
          updated_by = $4,
          updated_at = now()
      WHERE company_id = $1
        AND deleted_at IS NULL
        AND COALESCE(target_app_id, $5::uuid) = COALESCE($2::uuid, $5::uuid)
        AND COALESCE(environment_id, $5::uuid) = COALESCE($3::uuid, $5::uuid)
    `,
    [companyId, targetAppId, environmentId, updatedBy, NULL_SCOPE_ID]
  );
}

async function getRowScope(type: ConfigType, id: string, companyId: string) {
  const result = await getPool().query<{ target_app_id: string | null; environment_id: string | null }>(
    `SELECT target_app_id, environment_id FROM ${tableFor(type)} WHERE id = $1 AND company_id = $2`,
    [id, companyId]
  );

  return result.rows[0] || null;
}

async function ensurePrimaryConfig(type: ConfigType, companyId: string, targetAppId: string | null, environmentId: string | null) {
  const table = tableFor(type);

  const primary = await getPool().query<{ id: string }>(
    `
      SELECT id
      FROM ${table}
      WHERE company_id = $1
        AND deleted_at IS NULL
        AND is_primary = true
        AND COALESCE(target_app_id, $4::uuid) = COALESCE($2::uuid, $4::uuid)
        AND COALESCE(environment_id, $4::uuid) = COALESCE($3::uuid, $4::uuid)
      LIMIT 1
    `,
    [companyId, targetAppId, environmentId, NULL_SCOPE_ID]
  );

  if (primary.rowCount) {
    return;
  }

  const candidate = await getPool().query<{ id: string }>(
    `
      SELECT id
      FROM ${table}
      WHERE company_id = $1
        AND deleted_at IS NULL
        AND is_active = true
        AND COALESCE(target_app_id, $4::uuid) = COALESCE($2::uuid, $4::uuid)
        AND COALESCE(environment_id, $4::uuid) = COALESCE($3::uuid, $4::uuid)
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `,
    [companyId, targetAppId, environmentId, NULL_SCOPE_ID]
  );

  if (!candidate.rowCount) {
    return;
  }

  await getPool().query(
    `
      UPDATE ${table}
      SET is_primary = true,
          updated_at = now()
      WHERE id = $1
    `,
    [candidate.rows[0].id]
  );
}

async function readConfig(companyId: string) {
  return adminAIProviderConfig(await getAdminAIProviderConfig(companyId));
}

export async function GET() {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.aiConfiguration)) {
    return NextResponse.json({ message: "You do not have permission to manage AI configuration." }, { status: 403 });
  }

  return NextResponse.json(await readConfig(session.user.tenantId));
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    if (!hasModuleAccess(session, MODULE_KEYS.aiConfiguration)) {
      return NextResponse.json({ message: "You do not have permission to manage AI configuration." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Configuration payload is required." }, { status: 400 });
    }

    const type = body.type === "embedding" || body.type === "llm" ? body.type : null;

    if (!type) {
      return NextResponse.json({ message: "Configuration type is required." }, { status: 400 });
    }

    const companyId = session.user.tenantId;

    if (!canAccessCompany(companyId, session)) {
      return NextResponse.json({ message: "You do not have access to this company." }, { status: 403 });
    }

    if (typeof body.provider !== "string" || typeof body.model !== "string") {
      return NextResponse.json({ message: "Provider and model are required." }, { status: 400 });
    }

    const scope = await resolveScope(companyId, body.target_app_id, body.environment_id);

    if ("message" in scope) {
      return NextResponse.json({ message: scope.message }, { status: 400 });
    }

    if (type === "embedding") {
      const isActive = body.is_active !== false;
      const isPrimary = body.is_primary === true;

      if (isPrimary) {
        await unPrimaryOthersInScope("embedding", companyId, scope.targetAppId, scope.environmentId, session.user.id);
      }

      await getPool().query(
        `
          INSERT INTO ai_embedding_provider_configs (
            company_id,
            provider,
            model,
            dimension,
            endpoint,
            api_key,
            is_active,
            is_primary,
            target_app_id,
            environment_id,
            created_by,
            updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
        `,
        [
          companyId,
          body.provider,
          body.model,
          typeof body.dimension === "number" ? body.dimension : Number(body.dimension || 0) || null,
          typeof body.endpoint === "string" ? body.endpoint : "",
          typeof body.api_key === "string" ? body.api_key : "",
          isActive,
          isPrimary && isActive,
          scope.targetAppId,
          scope.environmentId,
          session.user.id
        ]
      );

      await ensurePrimaryConfig("embedding", companyId, scope.targetAppId, scope.environmentId);
    } else {
      const isActive = body.is_active !== false;
      const isPrimary = body.is_primary === true;

      if (isPrimary) {
        await unPrimaryOthersInScope("llm", companyId, scope.targetAppId, scope.environmentId, session.user.id);
      }

      await getPool().query(
        `
          INSERT INTO ai_llm_provider_configs (
            company_id,
            provider,
            model,
            endpoint,
            api_key,
            is_active,
            is_primary,
            target_app_id,
            environment_id,
            created_by,
            updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        `,
        [
          companyId,
          body.provider,
          body.model,
          typeof body.endpoint === "string" ? body.endpoint : "",
          typeof body.api_key === "string" ? body.api_key : "",
          isActive,
          isPrimary && isActive,
          scope.targetAppId,
          scope.environmentId,
          session.user.id
        ]
      );

      await ensurePrimaryConfig("llm", companyId, scope.targetAppId, scope.environmentId);
    }

    const reembedding = type === "embedding" && body.reembed_documents === true
      ? await enqueueDocumentReembeddingJobs(companyId)
      : null;
    return NextResponse.json({ ...(await readConfig(companyId)), reembedding });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return NextResponse.json({ message: "A configuration with the same provider and model already exists for this scope." }, { status: 400 });
    }

    console.error("Error creating AI configuration:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create AI configuration." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    if (!hasModuleAccess(session, MODULE_KEYS.aiConfiguration)) {
      return NextResponse.json({ message: "You do not have permission to manage AI configuration." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Configuration payload is required." }, { status: 400 });
    }

    const type = body.type === "embedding" || body.type === "llm" ? body.type : null;

    if (!type || typeof body.id !== "string") {
      return NextResponse.json({ message: "Configuration id and type are required." }, { status: 400 });
    }

    const companyId = session.user.tenantId;

    const scope = await resolveScope(companyId, body.target_app_id, body.environment_id);

    if ("message" in scope) {
      return NextResponse.json({ message: scope.message }, { status: 400 });
    }

    if (type === "embedding") {
      const isActive = body.is_active !== false;
      const isPrimary = body.is_primary === true;

      if (isPrimary) {
        await unPrimaryOthersInScope("embedding", companyId, scope.targetAppId, scope.environmentId, session.user.id);
      }

      const result = await getPool().query(
        `
          UPDATE ai_embedding_provider_configs
          SET provider = $3,
              model = $4,
              dimension = $5,
              endpoint = $6,
              api_key = $7,
              is_active = $8,
              is_primary = $9,
              target_app_id = $10,
              environment_id = $11,
              updated_by = $12,
              updated_at = now()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          body.id,
          companyId,
          body.provider,
          body.model,
          typeof body.dimension === "number" ? body.dimension : Number(body.dimension || 0) || null,
          typeof body.endpoint === "string" ? body.endpoint : "",
          typeof body.api_key === "string" ? body.api_key : "",
          isActive,
          isPrimary && isActive,
          scope.targetAppId,
          scope.environmentId,
          session.user.id
        ]
      );

      if (!result.rowCount) {
        return NextResponse.json({ message: "Configuration not found." }, { status: 404 });
      }

      await ensurePrimaryConfig("embedding", companyId, scope.targetAppId, scope.environmentId);
    } else {
      const isActive = body.is_active !== false;
      const isPrimary = body.is_primary === true;

      if (isPrimary) {
        await unPrimaryOthersInScope("llm", companyId, scope.targetAppId, scope.environmentId, session.user.id);
      }

      const result = await getPool().query(
        `
          UPDATE ai_llm_provider_configs
          SET provider = $3,
              model = $4,
              endpoint = $5,
              api_key = $6,
              is_active = $7,
              is_primary = $8,
              target_app_id = $9,
              environment_id = $10,
              updated_by = $11,
              updated_at = now()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          body.id,
          companyId,
          body.provider,
          body.model,
          typeof body.endpoint === "string" ? body.endpoint : "",
          typeof body.api_key === "string" ? body.api_key : "",
          isActive,
          isPrimary && isActive,
          scope.targetAppId,
          scope.environmentId,
          session.user.id
        ]
      );

      if (!result.rowCount) {
        return NextResponse.json({ message: "Configuration not found." }, { status: 404 });
      }

      await ensurePrimaryConfig("llm", companyId, scope.targetAppId, scope.environmentId);
    }

    const reembedding = type === "embedding" && body.reembed_documents === true
      ? await enqueueDocumentReembeddingJobs(companyId)
      : null;
    return NextResponse.json({ ...(await readConfig(companyId)), reembedding });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return NextResponse.json({ message: "A configuration with the same provider and model already exists for this scope." }, { status: 400 });
    }

    console.error("Error updating AI configuration:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update AI configuration." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    if (!hasModuleAccess(session, MODULE_KEYS.aiConfiguration)) {
      return NextResponse.json({ message: "You do not have permission to manage AI configuration." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const type = body?.type === "embedding" || body?.type === "llm" ? body.type : null;
    const action = body?.action;
    const id = typeof body?.id === "string" ? body.id : "";

    if (!type || !id || (action !== "toggle_active" && action !== "set_primary")) {
      return NextResponse.json({ message: "Type, id, and action are required." }, { status: 400 });
    }

    const companyId = session.user.tenantId;
    const table = tableFor(type);
    const rowScope = await getRowScope(type, id, companyId);

    if (!rowScope) {
      return NextResponse.json({ message: "Configuration not found." }, { status: 404 });
    }

    if (action === "toggle_active") {
      const value = body.value === true;
      const result = await getPool().query(
        `
          UPDATE ${table}
          SET is_active = $3,
              is_primary = CASE WHEN $3 = false THEN false ELSE is_primary END,
              updated_by = $4,
              updated_at = now()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [id, companyId, value, session.user.id]
      );

      if (!result.rowCount) {
        return NextResponse.json({ message: "Configuration not found." }, { status: 404 });
      }
    }

    if (action === "set_primary") {
      const value = body.value === true;

      if (value) {
        await unPrimaryOthersInScope(type, companyId, rowScope.target_app_id, rowScope.environment_id, session.user.id);

        const result = await getPool().query(
          `
            UPDATE ${table}
            SET is_primary = true,
                is_active = true,
                updated_by = $3,
                updated_at = now()
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
          `,
          [id, companyId, session.user.id]
        );

        if (!result.rowCount) {
          return NextResponse.json({ message: "Configuration not found." }, { status: 404 });
        }
      } else {
        await getPool().query(
          `
            UPDATE ${table}
            SET is_primary = false,
                updated_by = $3,
                updated_at = now()
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
          `,
          [id, companyId, session.user.id]
        );
      }
    }

    await ensurePrimaryConfig(type, companyId, rowScope.target_app_id, rowScope.environment_id);
    return NextResponse.json(await readConfig(companyId));
  } catch (error) {
    console.error("Error patching AI configuration:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to patch AI configuration." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }

    if (!hasModuleAccess(session, MODULE_KEYS.aiConfiguration)) {
      return NextResponse.json({ message: "You do not have permission to manage AI configuration." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const type = body?.type === "embedding" || body?.type === "llm" ? body.type : null;
    const id = typeof body?.id === "string" ? body.id : "";

    if (!type || !id) {
      return NextResponse.json({ message: "Type and id are required." }, { status: 400 });
    }

    const table = tableFor(type);
    const companyId = session.user.tenantId;
    const rowScope = await getRowScope(type, id, companyId);

    if (!rowScope) {
      return NextResponse.json({ message: "Configuration not found." }, { status: 404 });
    }

    const result = await getPool().query(
      `
        UPDATE ${table}
        SET deleted_at = now(),
            is_primary = false,
            updated_by = $3,
            updated_at = now()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [id, companyId, session.user.id]
    );

    if (!result.rowCount) {
      return NextResponse.json({ message: "Configuration not found." }, { status: 404 });
    }

    await ensurePrimaryConfig(type, companyId, rowScope.target_app_id, rowScope.environment_id);
    return NextResponse.json(await readConfig(companyId));
  } catch (error) {
    console.error("Error deleting AI configuration:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete AI configuration." },
      { status: 500 }
    );
  }
}
