import crypto from "node:crypto";
import { ConnectorError, readError, type ConnectorCredential, type ConnectorTestResult } from "./types";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function parseServiceAccount(raw: string | undefined): ServiceAccount {
  if (!raw || !raw.trim()) {
    throw new ConnectorError("A service account JSON key is required.");
  }
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConnectorError("The service account JSON is not valid JSON.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new ConnectorError("The service account JSON is missing client_email or private_key.");
  }
  return parsed;
}

async function tokenFromServiceAccount(account: ServiceAccount): Promise<string> {
  const tokenUri = account.token_uri || DEFAULT_TOKEN_URI;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: DRIVE_SCOPE,
      aud: tokenUri,
      iat: now,
      exp: now + 3600
    })
  );
  const signingInput = `${header}.${claim}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(signingInput), account.private_key)
    .toString("base64url");
  const assertion = `${signingInput}.${signature}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  if (!response.ok) {
    throw new ConnectorError(`Google token request failed: ${await readError(response)}`, 401);
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new ConnectorError("Google did not return an access token.", 401);
  }
  return json.access_token;
}

export async function getGoogleDriveAccessToken(credential: ConnectorCredential): Promise<string> {
  if (credential.authType === "access_token") {
    const token = String(credential.secret.accessToken ?? "").trim();
    if (!token) throw new ConnectorError("An access token is required.");
    return token;
  }
  if (credential.authType === "service_account") {
    return tokenFromServiceAccount(parseServiceAccount(credential.secret.serviceAccountJson));
  }
  throw new ConnectorError(
    "Google Drive supports a service account key or a direct access token for automated ingestion."
  );
}

export async function testGoogleDriveConnection(credential: ConnectorCredential): Promise<ConnectorTestResult> {
  const token = await getGoogleDriveAccessToken(credential);
  const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    return { success: false, message: `Google Drive rejected the credentials: ${await readError(response)}` };
  }
  const json = (await response.json()) as { user?: { emailAddress?: string; displayName?: string } };
  const who = json.user?.emailAddress || json.user?.displayName || "the service account";
  return { success: true, message: `Connected to Google Drive as ${who}.` };
}
