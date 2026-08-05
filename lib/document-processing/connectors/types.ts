// Shared types + auth for the Google Drive and SharePoint ingestion connectors.
// These run inside the Next.js app (Node runtime). Credentials are the same
// shape the "Connection credentials" UI collects and the ingestion_credentials
// table stores (public_config_json + encrypted secret).

export type ConnectorProvider = "google_drive" | "sharepoint";
export type ConnectorAuthType = "oauth_client" | "service_account" | "access_token";

export type ConnectorCredential = {
  provider: ConnectorProvider;
  authType: ConnectorAuthType;
  publicConfig: { tenantId?: string; clientId?: string; [key: string]: unknown };
  secret: {
    serviceAccountJson?: string;
    accessToken?: string;
    clientSecret?: string;
    [key: string]: unknown;
  };
};

export type ConnectorTestResult = { success: boolean; message: string };

export class ConnectorError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "ConnectorError";
  }
}

export function normalizeConnectorCredential(body: unknown): ConnectorCredential {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const provider = String(record.provider ?? "");
  const authType = String(record.authType ?? "");

  if (provider !== "google_drive" && provider !== "sharepoint") {
    throw new ConnectorError("Unsupported provider.");
  }
  if (authType !== "oauth_client" && authType !== "service_account" && authType !== "access_token") {
    throw new ConnectorError("Unsupported authentication type.");
  }

  const publicConfig = (record.publicConfig && typeof record.publicConfig === "object"
    ? record.publicConfig
    : {}) as ConnectorCredential["publicConfig"];
  const secret = (record.secret && typeof record.secret === "object"
    ? record.secret
    : {}) as ConnectorCredential["secret"];

  return { provider, authType, publicConfig, secret };
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const json = JSON.parse(text);
    return (
      json?.error?.message ||
      json?.error_description ||
      json?.error ||
      text ||
      `HTTP ${response.status}`
    );
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

export { readError };
