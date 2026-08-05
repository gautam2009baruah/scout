import { getPool } from "@/lib/db/pool";
import { decryptSecret } from "@/lib/orchestrations/http-trigger/security";
import {
  ConnectorError,
  type ConnectorAuthType,
  type ConnectorCredential,
  type ConnectorProvider
} from "./types";

// Resolve a saved Connection credential (ingestion_credentials) by id, strictly
// scoped to the owning company, and decrypt its secret. Never crosses companies.
export async function resolveStoredConnectorCredential(
  companyId: string,
  credentialId: string
): Promise<ConnectorCredential> {
  if (!companyId || !credentialId) {
    throw new ConnectorError("Missing connector credential reference.");
  }

  const result = await getPool().query<{
    provider: string;
    auth_type: string;
    public_config_json: Record<string, unknown> | null;
    secret_ciphertext: string | null;
  }>(
    `SELECT provider, auth_type, public_config_json, secret_ciphertext
     FROM ingestion_credentials
     WHERE id = $1 AND company_id = $2`,
    [credentialId, companyId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new ConnectorError("Connection credentials were not found.", 404);
  }
  if (row.provider !== "google_drive" && row.provider !== "sharepoint") {
    throw new ConnectorError("Unsupported connector provider.");
  }

  let secret: Record<string, unknown> = {};
  const decrypted = decryptSecret(row.secret_ciphertext || "");
  if (decrypted) {
    try {
      secret = JSON.parse(decrypted);
    } catch {
      secret = {};
    }
  }

  return {
    provider: row.provider as ConnectorProvider,
    authType: row.auth_type as ConnectorAuthType,
    publicConfig: (row.public_config_json || {}) as ConnectorCredential["publicConfig"],
    secret: secret as ConnectorCredential["secret"]
  };
}
