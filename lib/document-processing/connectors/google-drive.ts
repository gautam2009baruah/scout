import crypto from "node:crypto";
import {
  CONNECTOR_SUPPORTED_TYPES,
  ConnectorError,
  readError,
  type ConnectorCredential,
  type ConnectorFileRef,
  type ConnectorListItem,
  type ConnectorTestResult
} from "./types";

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

const GOOGLE_NATIVE_EXPORT: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: "docx"
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx"
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ext: "pptx"
  }
};

type DriveFile = { id: string; name: string; mimeType: string; size?: string; webViewLink?: string };

function extractDriveId(rawUrl: string): string {
  const value = rawUrl.trim();
  const patterns = [/\/folders\/([a-zA-Z0-9_-]+)/, /\/file\/d\/([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  if (/^[a-zA-Z0-9_-]{16,}$/.test(value)) return value;
  throw new ConnectorError("Could not find a Google Drive file or folder ID in that link.");
}

async function driveApi<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new ConnectorError(`Google Drive API error: ${await readError(response)}`, response.status);
  }
  return (await response.json()) as T;
}

function toDriveListItem(file: DriveFile): ConnectorListItem | null {
  const native = GOOGLE_NATIVE_EXPORT[file.mimeType];
  if (native) {
    const name = file.name.toLowerCase().endsWith(`.${native.ext}`) ? file.name : `${file.name}.${native.ext}`;
    return {
      itemId: file.id,
      name,
      fileType: native.ext,
      mimeType: file.mimeType,
      size: Number(file.size || 0),
      webUrl: file.webViewLink,
      downloadMime: native.mime
    };
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!CONNECTOR_SUPPORTED_TYPES.includes(ext)) return null;
  return {
    itemId: file.id,
    name: file.name,
    fileType: ext,
    mimeType: file.mimeType,
    size: Number(file.size || 0),
    webUrl: file.webViewLink
  };
}

export async function listGoogleDriveItems(
  credential: ConnectorCredential,
  url: string,
  maxFiles: number
): Promise<ConnectorListItem[]> {
  const token = await getGoogleDriveAccessToken(credential);
  const rootId = extractDriveId(url);
  const meta = await driveApi<DriveFile>(
    token,
    `files/${rootId}?fields=id,name,mimeType,size,webViewLink&supportsAllDrives=true`
  );

  const items: ConnectorListItem[] = [];

  if (meta.mimeType !== "application/vnd.google-apps.folder") {
    const single = toDriveListItem(meta);
    if (!single) throw new ConnectorError("That file type is not supported for ingestion.");
    return [single];
  }

  const queue = [rootId];
  const seen = new Set([rootId]);

  while (queue.length && items.length < maxFiles) {
    const folderId = queue.shift()!;
    let pageToken: string | undefined;
    do {
      const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const data = await driveApi<{ files?: DriveFile[]; nextPageToken?: string }>(
        token,
        `files?q=${query}&fields=nextPageToken,files(id,name,mimeType,size,webViewLink)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ""}`
      );
      for (const file of data.files || []) {
        if (items.length >= maxFiles) break;
        if (file.mimeType === "application/vnd.google-apps.folder") {
          if (!seen.has(file.id)) {
            seen.add(file.id);
            queue.push(file.id);
          }
          continue;
        }
        const item = toDriveListItem(file);
        if (item) items.push(item);
      }
      pageToken = data.nextPageToken;
    } while (pageToken && items.length < maxFiles);
  }

  return items;
}

export async function downloadGoogleDriveFile(
  credential: ConnectorCredential,
  ref: ConnectorFileRef
): Promise<Buffer> {
  const token = await getGoogleDriveAccessToken(credential);
  const endpoint = ref.download_mime
    ? `https://www.googleapis.com/drive/v3/files/${ref.item_id}/export?mimeType=${encodeURIComponent(ref.download_mime)}`
    : `https://www.googleapis.com/drive/v3/files/${ref.item_id}?alt=media&supportsAllDrives=true`;
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new ConnectorError(`Google Drive download failed: ${await readError(response)}`, response.status);
  }
  return Buffer.from(await response.arrayBuffer());
}
