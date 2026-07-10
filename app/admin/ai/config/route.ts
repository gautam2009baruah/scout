import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { adminAIProviderConfig, getAdminAIProviderConfig } from "@/lib/ai/config";
import { getPool } from "@/lib/db/pool";

export const runtime = "nodejs";

type ConfigType = "embedding" | "llm";

function canAccessCompany(companyId: string, session: NonNullable<Awaited<ReturnType<typeof getCurrentAdminSession>>>) {
  return session.availableCompanies.some((company) => company.companyId === companyId);
}

async function ensurePrimaryConfig(type: ConfigType, companyId: string) {
  const table = type === "embedding" ? "ai_embedding_provider_configs" : "ai_llm_provider_configs";

  const primary = await getPool().query<{ id: string }>(
    `
      SELECT id
      FROM ${table}
      WHERE company_id = $1
        AND deleted_at IS NULL
        AND is_primary = true
      LIMIT 1
    `,
    [companyId]
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
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `,
    [companyId]
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

    if (type === "embedding") {
      const isActive = body.is_active !== false;
      const isPrimary = body.is_primary === true;

      if (isPrimary) {
        await getPool().query(
          `
            UPDATE ai_embedding_provider_configs
            SET is_primary = false,
                updated_by = $2,
                updated_at = now()
            WHERE company_id = $1
              AND deleted_at IS NULL
          `,
          [companyId, session.user.id]
        );
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
            created_by,
            updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
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
          session.user.id
        ]
      );

      await ensurePrimaryConfig("embedding", companyId);
    } else {
      const isActive = body.is_active !== false;
      const isPrimary = body.is_primary === true;

      if (isPrimary) {
        await getPool().query(
          `
            UPDATE ai_llm_provider_configs
            SET is_primary = false,
                updated_by = $2,
                updated_at = now()
            WHERE company_id = $1
              AND deleted_at IS NULL
          `,
          [companyId, session.user.id]
        );
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
            created_by,
            updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        `,
        [
          companyId,
          body.provider,
          body.model,
          typeof body.endpoint === "string" ? body.endpoint : "",
          typeof body.api_key === "string" ? body.api_key : "",
          isActive,
          isPrimary && isActive,
          session.user.id
        ]
      );

      await ensurePrimaryConfig("llm", companyId);
    }

    return NextResponse.json(await readConfig(companyId));
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return NextResponse.json({ message: "A configuration with the same provider and model already exists for this company." }, { status: 400 });
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

    if (type === "embedding") {
      const isActive = body.is_active !== false;
      const isPrimary = body.is_primary === true;

      if (isPrimary) {
        await getPool().query(
          `
            UPDATE ai_embedding_provider_configs
            SET is_primary = false,
                updated_by = $2,
                updated_at = now()
            WHERE company_id = $1
              AND deleted_at IS NULL
          `,
          [companyId, session.user.id]
        );
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
              updated_by = $10,
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
          session.user.id
        ]
      );

      if (!result.rowCount) {
        return NextResponse.json({ message: "Configuration not found." }, { status: 404 });
      }

      await ensurePrimaryConfig("embedding", companyId);
    } else {
      const isActive = body.is_active !== false;
      const isPrimary = body.is_primary === true;

      if (isPrimary) {
        await getPool().query(
          `
            UPDATE ai_llm_provider_configs
            SET is_primary = false,
                updated_by = $2,
                updated_at = now()
            WHERE company_id = $1
              AND deleted_at IS NULL
          `,
          [companyId, session.user.id]
        );
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
              updated_by = $9,
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
          session.user.id
        ]
      );

      if (!result.rowCount) {
        return NextResponse.json({ message: "Configuration not found." }, { status: 404 });
      }

      await ensurePrimaryConfig("llm", companyId);
    }

    return NextResponse.json(await readConfig(companyId));
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return NextResponse.json({ message: "A configuration with the same provider and model already exists for this company." }, { status: 400 });
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
    const table = type === "embedding" ? "ai_embedding_provider_configs" : "ai_llm_provider_configs";

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
        await getPool().query(
          `
            UPDATE ${table}
            SET is_primary = false,
                updated_by = $2,
                updated_at = now()
            WHERE company_id = $1
              AND deleted_at IS NULL
          `,
          [companyId, session.user.id]
        );

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

    await ensurePrimaryConfig(type, companyId);
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

    const table = type === "embedding" ? "ai_embedding_provider_configs" : "ai_llm_provider_configs";
    const companyId = session.user.tenantId;

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

    await ensurePrimaryConfig(type, companyId);
    return NextResponse.json(await readConfig(companyId));
  } catch (error) {
    console.error("Error deleting AI configuration:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete AI configuration." },
      { status: 500 }
    );
  }
}
