import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getPool } from "@/lib/db/pool";
import { encryptSecret } from "@/lib/orchestrations/http-trigger/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const provider = String(body?.provider ?? "");
  const name = String(body?.name ?? "").trim();
  const authType = String(body?.authType ?? "");
  const allowedProviders = ["google_drive", "sharepoint", "web"];
  const allowedAuth = ["oauth_client", "service_account", "access_token", "api_key", "basic", "anonymous"];
  if (!allowedProviders.includes(provider) || !allowedAuth.includes(authType) || !name) {
    return NextResponse.json({ message: "Provider, connection name and authentication type are required." }, { status: 400 });
  }

  const publicConfig = typeof body?.publicConfig === "object" && body.publicConfig ? body.publicConfig : {};
  const secret = typeof body?.secret === "object" && body.secret ? JSON.stringify(body.secret) : "";
  if (authType !== "anonymous" && !secret) return NextResponse.json({ message: "Connection credentials are required." }, { status: 400 });

  try {
    const result = await getPool().query<{ id: string }>(`
      INSERT INTO ingestion_credentials (company_id, provider, name, auth_type, public_config_json, secret_ciphertext, created_by)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
      ON CONFLICT (company_id, provider, name) DO UPDATE SET
        auth_type = EXCLUDED.auth_type,
        public_config_json = EXCLUDED.public_config_json,
        secret_ciphertext = EXCLUDED.secret_ciphertext,
        updated_at = now()
      RETURNING id
    `, [session.user.tenantId, provider, name, authType, JSON.stringify(publicConfig), encryptSecret(secret), session.user.id]);
    return NextResponse.json({ credentialId: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("Unable to save ingestion credentials", error);
    return NextResponse.json({ message: "Unable to save connection credentials." }, { status: 500 });
  }
}
