import { downloadGoogleDriveFile, listGoogleDriveItems } from "./google-drive";
import { downloadSharePointItem, listSharePointItems } from "./sharepoint";
import { resolveStoredConnectorCredential } from "./ingestion-credentials";
import { ConnectorError, type ConnectorFileRef, type ConnectorListItem, type ConnectorProvider } from "./types";

export type { ConnectorFileRef, ConnectorListItem } from "./types";

const MAX_FILES_CEILING = 1000;

// List the ingestable files behind a pasted Drive/SharePoint link, using the
// company's saved connection credential. Folders are walked recursively up to a
// safety cap.
export async function listConnectorItems(input: {
  provider: ConnectorProvider;
  companyId: string;
  credentialId: string;
  url: string;
  maxFiles?: number;
}): Promise<ConnectorListItem[]> {
  const url = String(input.url || "").trim();
  if (!url) {
    throw new ConnectorError("A Drive or SharePoint link is required.");
  }

  const credential = await resolveStoredConnectorCredential(input.companyId, input.credentialId);
  const cap = Math.min(MAX_FILES_CEILING, Math.max(1, Math.floor(input.maxFiles || 200)));

  const items =
    credential.provider === "google_drive"
      ? await listGoogleDriveItems(credential, url, cap)
      : await listSharePointItems(credential, url, cap);

  if (items.length === 0) {
    throw new ConnectorError("No supported files were found behind that link.");
  }
  return items;
}

// Download a single file's bytes. Called by the background worker (via the
// internal connector-file endpoint) so large libraries never block the admin.
export async function downloadConnectorFile(companyId: string, ref: ConnectorFileRef): Promise<Buffer> {
  const credential = await resolveStoredConnectorCredential(companyId, ref.credential_reference);
  return credential.provider === "google_drive"
    ? downloadGoogleDriveFile(credential, ref)
    : downloadSharePointItem(credential, ref);
}
