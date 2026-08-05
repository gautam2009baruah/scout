import {
  CONNECTOR_SUPPORTED_TYPES,
  ConnectorError,
  readError,
  type ConnectorCredential,
  type ConnectorFileRef,
  type ConnectorListItem,
  type ConnectorTestResult
} from "./types";

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

type GraphItem = {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  file?: unknown;
  folder?: unknown;
  parentReference?: { driveId?: string };
};

// Graph resolves any SharePoint/OneDrive URL (site library, subfolder, or a
// single file) into a driveItem via the Shares API, so admins can simply paste
// the link from their browser.
function encodeShareUrl(url: string): string {
  const base64 = Buffer.from(url, "utf8").toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `u!${base64}`;
}

async function graph<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`https://graph.microsoft.com/v1.0/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new ConnectorError(`Microsoft Graph error: ${await readError(response)}`, response.status);
  }
  return (await response.json()) as T;
}

function toGraphListItem(item: GraphItem, driveId: string): ConnectorListItem | null {
  const ext = (item.name.split(".").pop() || "").toLowerCase();
  if (!CONNECTOR_SUPPORTED_TYPES.includes(ext)) return null;
  return { itemId: item.id, driveId, name: item.name, fileType: ext, size: Number(item.size || 0), webUrl: item.webUrl };
}

export async function listSharePointItems(
  credential: ConnectorCredential,
  url: string,
  maxFiles: number
): Promise<ConnectorListItem[]> {
  const token = await getSharePointAccessToken(credential);
  const shareId = encodeShareUrl(url.trim());
  const root = await graph<GraphItem>(
    token,
    `shares/${shareId}/driveItem?$select=id,name,size,file,folder,webUrl,parentReference`
  );

  const driveId = root.parentReference?.driveId;
  if (!driveId) {
    throw new ConnectorError("Could not resolve the SharePoint drive for that link.");
  }

  const items: ConnectorListItem[] = [];

  if (!root.folder) {
    const single = toGraphListItem(root, driveId);
    if (!single) throw new ConnectorError("That file type is not supported for ingestion.");
    return [single];
  }

  const queue = [root.id];
  const seen = new Set([root.id]);

  while (queue.length && items.length < maxFiles) {
    const itemId = queue.shift()!;
    let nextPath: string | null =
      `drives/${driveId}/items/${itemId}/children?$select=id,name,size,file,folder,webUrl&$top=200`;
    while (nextPath && items.length < maxFiles) {
      const data: { value?: GraphItem[]; "@odata.nextLink"?: string } = await graph(token, nextPath);
      for (const child of data.value || []) {
        if (items.length >= maxFiles) break;
        if (child.folder) {
          if (!seen.has(child.id)) {
            seen.add(child.id);
            queue.push(child.id);
          }
          continue;
        }
        const item = toGraphListItem(child, driveId);
        if (item) items.push(item);
      }
      const next = data["@odata.nextLink"];
      nextPath = next ? next.replace("https://graph.microsoft.com/v1.0/", "") : null;
    }
  }

  return items;
}

export async function downloadSharePointItem(
  credential: ConnectorCredential,
  ref: ConnectorFileRef
): Promise<Buffer> {
  const token = await getSharePointAccessToken(credential);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${ref.drive_id}/items/${ref.item_id}/content`,
    { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" }
  );
  if (!response.ok) {
    throw new ConnectorError(`SharePoint download failed: ${await readError(response)}`, response.status);
  }
  return Buffer.from(await response.arrayBuffer());
}
