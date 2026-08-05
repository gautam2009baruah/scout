import { ConnectorError, readError, type ConnectorCredential, type ConnectorTestResult } from "./types";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

async function tokenFromClientCredentials(credential: ConnectorCredential): Promise<string> {
  const tenantId = String(credential.publicConfig.tenantId ?? "").trim();
  const clientId = String(credential.publicConfig.clientId ?? "").trim();
  const clientSecret = String(credential.secret.clientSecret ?? "").trim();

  if (!tenantId || !clientId || !clientSecret) {
    throw new ConnectorError("SharePoint requires a tenant ID, client ID, and client secret.");
  }

  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: GRAPH_SCOPE,
      grant_type: "client_credentials"
    })
  });
  if (!response.ok) {
    throw new ConnectorError(`Microsoft token request failed: ${await readError(response)}`, 401);
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new ConnectorError("Microsoft did not return an access token.", 401);
  }
  return json.access_token;
}

export async function getSharePointAccessToken(credential: ConnectorCredential): Promise<string> {
  if (credential.authType === "access_token") {
    const token = String(credential.secret.accessToken ?? "").trim();
    if (!token) throw new ConnectorError("An access token is required.");
    return token;
  }
  if (credential.authType === "oauth_client") {
    return tokenFromClientCredentials(credential);
  }
  throw new ConnectorError(
    "SharePoint supports client credentials (tenant + client ID + secret) or a direct access token."
  );
}

export async function testSharePointConnection(credential: ConnectorCredential): Promise<ConnectorTestResult> {
  const token = await getSharePointAccessToken(credential);
  const response = await fetch("https://graph.microsoft.com/v1.0/sites/root", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    return { success: false, message: `Microsoft Graph rejected the credentials: ${await readError(response)}` };
  }
  const json = (await response.json()) as { displayName?: string; webUrl?: string };
  const label = json.displayName || json.webUrl || "your tenant";
  return { success: true, message: `Connected to SharePoint (${label}).` };
}
