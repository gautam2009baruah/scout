import crypto from "node:crypto";
import type { AdminSession } from "./auth";
import {
  buildDocumentStoragePath,
  checksumBuffer,
  createDocument,
  updateDocument
} from "./documents";
import { enqueueProcessingJob } from "./processing-jobs";
import { getStorageProvider } from "@/lib/storage/provider";

const TOKEN_VERSION = "v1";
const MAX_PAGE_BYTES = 5 * 1024 * 1024;

export class WebIngestionError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "WebIngestionError";
  }
}

type WebIngestionTokenPayload = {
  companyId: string;
  folderId: string;
  userId: string;
  exp: number;
};

function signingKey(): Buffer {
  const raw = process.env.APP_SECRET || process.env.HTTP_TRIGGER_SECRET_KEY || "scout-web-ingestion-default-key";
  return crypto.createHash("sha256").update(raw).digest();
}

function sign(body: string): string {
  return crypto.createHmac("sha256", signingKey()).update(`${TOKEN_VERSION}.${body}`).digest("base64url");
}

// Stateless, HMAC-signed pairing token. Minted by an authenticated admin who
// has access to the target folder; the browser extension presents it back on
// every page upload. No DB row is needed — the signature + short expiry are the
// only trust anchors, and scope is fixed to one company + folder at mint time.
export function mintWebIngestionToken(input: {
  companyId: string;
  folderId: string;
  userId: string;
  ttlHours?: number;
}): { token: string; expiresAt: Date } {
  const ttlHours = Math.min(720, Math.max(1, Math.floor(input.ttlHours ?? 24)));
  const exp = Date.now() + ttlHours * 3_600_000;
  const payload: WebIngestionTokenPayload = {
    companyId: input.companyId,
    folderId: input.folderId,
    userId: input.userId,
    exp
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { token: `${TOKEN_VERSION}.${body}.${sign(body)}`, expiresAt: new Date(exp) };
}

export function verifyWebIngestionToken(token: string): WebIngestionTokenPayload {
  const parts = (token || "").split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    throw new WebIngestionError("Invalid ingestion token.", 401);
  }

  const [, body, signature] = parts;
  const expected = sign(body);
  const provided = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length || !crypto.timingSafeEqual(provided, wanted)) {
    throw new WebIngestionError("Invalid ingestion token.", 401);
  }

  let payload: WebIngestionTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new WebIngestionError("Invalid ingestion token.", 401);
  }

  if (!payload.companyId || !payload.folderId || !payload.userId || !payload.exp) {
    throw new WebIngestionError("Invalid ingestion token.", 401);
  }

  if (Date.now() > payload.exp) {
    throw new WebIngestionError("Ingestion token has expired. Generate a new one in Scout.", 401);
  }

  return payload;
}

// The extension already authorized the company + folder when an admin minted
// the token, so the ingest path runs with a minimal synthetic session scoped to
// exactly that company. It is never derived from client input.
function syntheticSession(companyId: string, userId: string): AdminSession {
  return {
    user: {
      id: userId,
      tenantId: companyId,
      name: "Web Ingestor",
      email: "",
      roleId: "",
      isAdminRole: true,
      isActive: true,
      mustChangePassword: false
    },
    tenant: {} as AdminSession["tenant"],
    modules: [],
    availableCompanies: [
      { companyId, companyName: "", companySlug: "", roleId: "", roleName: "", isPrimary: true }
    ],
    expiresAt: new Date(Date.now() + 60_000)
  } as unknown as AdminSession;
}

function fileNameForUrl(pageUrl: URL): string {
  const slug = decodeURIComponent(pageUrl.pathname)
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 120);
  const host = pageUrl.hostname.replace(/[^a-zA-Z0-9.-]+/g, "-");
  return `${host}-${slug || "index"}.html`.slice(0, 180);
}

export async function ingestWebPageFromToken(
  token: string,
  input: { url: string; title?: string; html: string }
): Promise<{ documentId: string; status: string }> {
  const payload = verifyWebIngestionToken(token);

  const rawUrl = String(input.url || "").trim();
  const html = String(input.html ?? "");
  if (!rawUrl) {
    throw new WebIngestionError("A page URL is required.");
  }
  if (!html.trim()) {
    throw new WebIngestionError("Page content is empty.");
  }

  let pageUrl: URL;
  try {
    pageUrl = new URL(rawUrl);
  } catch {
    throw new WebIngestionError("Page URL is invalid.");
  }
  if (!["http:", "https:"].includes(pageUrl.protocol)) {
    throw new WebIngestionError("Only HTTP and HTTPS pages can be ingested.");
  }

  const buffer = Buffer.from(html, "utf8");
  if (buffer.byteLength > MAX_PAGE_BYTES) {
    throw new WebIngestionError("Page content exceeds the 5 MB limit.");
  }

  const session = syntheticSession(payload.companyId, payload.userId);
  const originalFilename = fileNameForUrl(pageUrl);
  const checksum = checksumBuffer(buffer);
  const name = (input.title || pageUrl.pathname || pageUrl.hostname).trim().slice(0, 200) || pageUrl.hostname;

  const document = await createDocument(
    {
      companyId: payload.companyId,
      folderId: payload.folderId,
      name,
      originalFilename,
      fileType: "html",
      mimeType: "text/html",
      fileSize: buffer.byteLength,
      checksum,
      storageMode: "managed_upload",
      externalSourceUrl: pageUrl.href,
      sourceMetadata: { ingested_via: "web_ingestor_extension", source_url: pageUrl.href },
      status: "queued"
    },
    session
  );

  const storagePath = buildDocumentStoragePath(payload.companyId, payload.folderId, document.id, originalFilename);
  const storage = getStorageProvider();
  await storage.save_file(buffer, storagePath);

  const uploaded = await updateDocument(
    document.id,
    { storagePath, status: "uploaded", errorMessage: null },
    session
  );

  await enqueueProcessingJob({
    companyId: uploaded.companyId,
    documentId: uploaded.id,
    jobType: "parse_document",
    maxAttempts: 3
  });

  return { documentId: uploaded.id, status: uploaded.status };
}
