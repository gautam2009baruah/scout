import { getPool } from "@/lib/db/pool";
import { getLLMProvider } from "@/lib/llm/providers";
import { getStorageProvider } from "@/lib/storage/provider";
import { getAccessibleTopicIds } from "./content-structure";
import { enqueueProcessingJob } from "./processing-jobs";
import type { AdminSession } from "./auth";
import crypto from "node:crypto";

export const DOCUMENT_STATUSES = [
  "uploaded",
  "queued",
  "processing",
  "parsed",
  "chunked",
  "embedded",
  "indexed",
  "failed",
  "deleted"
] as const;

export const SUPPORTED_DOCUMENT_FILE_TYPES = ["pdf", "docx", "pptx", "xlsx", "csv", "txt", "md", "html", "json", "xml", "epub", "png", "jpg", "jpeg", "webp", "tiff", "zip"] as const;
export const DOCUMENT_STORAGE_MODES = ["managed_upload", "external_reference", "strict_external_reference"] as const;

type DocumentStatus = typeof DOCUMENT_STATUSES[number];
type DocumentFileType = typeof SUPPORTED_DOCUMENT_FILE_TYPES[number];
type DocumentStorageMode = typeof DOCUMENT_STORAGE_MODES[number];

export type DocumentRow = {
  id: string;
  companyId: string;
  folderId: string;
  folderName: string;
  name: string;
  originalFilename: string;
  fileType: DocumentFileType;
  mimeType: string | null;
  fileSize: number;
  checksum: string;
  storagePath: string | null;
  storageMode: DocumentStorageMode;
  externalSourceUrl: string | null;
  externalSourceReference: string | null;
  sourceMetadata: Record<string, unknown>;
  version: number;
  status: DocumentStatus;
  uploadedBy: string;
  uploadedByName: string;
  errorMessage: string | null;
  roleAccessCount: number;
  userAccessCount: number;
  canDelete: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentVersionRow = {
  id: string;
  documentId: string;
  versionNumber: number;
  checksum: string;
  fileSize: number;
  fileType: string;
  mimeType: string | null;
  status: string;
  storageMode: DocumentStorageMode;
  storagePath: string | null;
  externalSourceUrl: string | null;
  externalSourceReference: string | null;
  sourceMetadata: Record<string, unknown>;
  parsedFilePath: string | null;
  pageCount: number | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
};

export type DocumentVersionComparison = {
  fromVersion: number;
  toVersion: number;
  identical: boolean;
  fromChecksum: string;
  toChecksum: string;
  stats: {
    fromLineCount: number;
    toLineCount: number;
    addedLines: number;
    removedLines: number;
    pageCountDelta: number;
  };
  addedPreview: string[];
  removedPreview: string[];
};

export type DocumentVersionChangeSummary = {
  fromVersion: number;
  toVersion: number;
  summary: string;
  provider: string;
  model: string;
  generatedAt: string;
};

export type CreateDocumentInput = {
  companyId: string;
  folderId: string;
  name?: string;
  originalFilename: string;
  fileType?: string;
  mimeType?: string;
  fileSize: number;
  checksum: string;
  storagePath?: string | null;
  storageMode?: string;
  externalSourceUrl?: string | null;
  externalSourceReference?: string | null;
  sourceMetadata?: Record<string, unknown>;
  version?: number;
  status?: DocumentStatus;
};

export type UpdateDocumentInput = {
  name?: string;
  status?: string;
  errorMessage?: string | null;
  storagePath?: string | null;
  version?: number;
};

export type DocumentFilters = {
  folderId?: string;
  status?: string;
  fileType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export class DocumentError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DocumentError";
    this.statusCode = statusCode;
  }
}

export type UploadDocumentFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ExternalFolderEntry = {
  externalSourceUrl: string;
  originalFilename: string;
  fileType: string;
  name?: string;
  sourceMetadata?: Record<string, unknown>;
};

function canonicalCrawlUrl(value: URL) {
  const url = new URL(value.href);
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) {
    if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) url.searchParams.delete(key);
  }
  if (Array.from(url.searchParams.keys()).length === 0) url.search = "";
  return url;
}

function htmlTitle(html: string, fallback: string) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return title || fallback;
}

function pageFilename(url: URL, index: number) {
  const slug = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 130);
  return `${slug || `page-${index + 1}`}.html`;
}

export async function discoverWebsitePages(startReference: string, options: { maxPages?: number; maxDepth?: number } = {}): Promise<ExternalFolderEntry[]> {
  let root: URL;
  try { root = canonicalCrawlUrl(new URL(startReference)); } catch { throw new DocumentError("Website must be a valid HTTP or HTTPS URL."); }
  if (!["http:", "https:"].includes(root.protocol)) throw new DocumentError("Only HTTP and HTTPS websites are supported.");

  const maxPages = Math.min(1000, Math.max(1, options.maxPages ?? 200));
  const maxDepth = Math.min(10, Math.max(0, options.maxDepth ?? 4));
  const pending: Array<{ url: URL; depth: number }> = [{ url: root, depth: 0 }];
  const queued = new Set([root.href]);
  const emitted = new Set<string>();
  const pages: ExternalFolderEntry[] = [];

  while (pending.length && pages.length < maxPages) {
    const current = pending.shift()!;
    let response: Response;
    try {
      response = await fetch(current.url, { headers: { Accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    } catch { continue; }
    if (!response.ok || !(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) continue;
    const finalUrl = canonicalCrawlUrl(new URL(response.url || current.url.href));
    if (finalUrl.origin !== root.origin) continue;
    if (emitted.has(finalUrl.href)) continue;
    emitted.add(finalUrl.href);
    const html = await response.text();
    const title = htmlTitle(html, finalUrl.pathname || finalUrl.hostname);
    pages.push({
      externalSourceUrl: finalUrl.href,
      originalFilename: pageFilename(finalUrl, pages.length),
      fileType: "html",
      name: title,
      sourceMetadata: { crawl_root: root.href, crawl_depth: current.depth, canonical_url: finalUrl.href }
    });
    if (current.depth >= maxDepth) continue;

    const hrefPattern = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = hrefPattern.exec(html))) {
      let candidate: URL;
      try { candidate = canonicalCrawlUrl(new URL(match[1], finalUrl)); } catch { continue; }
      if (candidate.origin !== root.origin || !["http:", "https:"].includes(candidate.protocol)) continue;
      if (/\.(?:jpg|jpeg|png|gif|svg|webp|ico|css|js|woff2?|ttf|eot|mp4|mp3|zip|pdf)(?:$|\?)/i.test(candidate.pathname)) continue;
      if (/\/(?:logout|signout|cart|checkout)(?:\/|$)/i.test(candidate.pathname)) continue;
      if (!queued.has(candidate.href)) {
        queued.add(candidate.href);
        pending.push({ url: candidate, depth: current.depth + 1 });
      }
    }
  }
  if (!pages.length) throw new DocumentError("No crawlable HTML pages were found.");
  return pages;
}

export async function discoverFeedPages(feedReference: string): Promise<ExternalFolderEntry[]> {
  const response = await fetch(feedReference, { headers: { Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new DocumentError(`Unable to read feed. HTTP ${response.status}.`);
  const xml = await response.text();
  const urls = new Set<string>();
  for (const pattern of [/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/gi, /<link\b[^>]*>([\s\S]*?)<\/link>/gi]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(xml))) {
      const value = match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
      try { const url = new URL(value, feedReference); if (["http:", "https:"].includes(url.protocol)) urls.add(canonicalCrawlUrl(url).href); } catch { /* ignore malformed feed entry */ }
    }
  }
  return Array.from(urls).slice(0, 500).map((url, index) => ({ externalSourceUrl: url, originalFilename: pageFilename(new URL(url), index), fileType: "html", sourceMetadata: { feed_url: feedReference } }));
}

export async function discoverSitemapPages(sitemapReference: string): Promise<ExternalFolderEntry[]> {
  const response = await fetch(sitemapReference, { headers: { Accept: "application/xml,text/xml" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new DocumentError(`Unable to read sitemap. HTTP ${response.status}.`);
  const xml = await response.text();
  const urls: string[] = [];
  const locPattern = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
  let locMatch: RegExpExecArray | null;
  while ((locMatch = locPattern.exec(xml))) {
    try { const url = new URL(locMatch[1].trim()); if (["http:", "https:"].includes(url.protocol)) urls.push(canonicalCrawlUrl(url).href); } catch { /* ignore malformed sitemap URL */ }
  }
  if (!urls.length) throw new DocumentError("No page URLs were found in the sitemap.");
  return Array.from(new Set(urls)).slice(0, 1000).map((url, index) => ({ externalSourceUrl: url, originalFilename: pageFilename(new URL(url), index), fileType: "html", sourceMetadata: { sitemap_url: sitemapReference } }));
}

function isDocumentStatus(value: string): value is DocumentStatus {
  return DOCUMENT_STATUSES.includes(value as DocumentStatus);
}

function isSupportedFileType(value: string): value is DocumentFileType {
  return SUPPORTED_DOCUMENT_FILE_TYPES.includes(value.toLowerCase() as DocumentFileType);
}

function isDocumentStorageMode(value: string): value is DocumentStorageMode {
  return DOCUMENT_STORAGE_MODES.includes(value as DocumentStorageMode);
}

function normalizeFileType(input: CreateDocumentInput) {
  const explicit = input.fileType?.trim().toLowerCase();

  if (explicit) {
    return explicit;
  }

  const extension = input.originalFilename.split(".").pop()?.toLowerCase() ?? "";
  return extension;
}

function defaultDocumentName(originalFilename: string) {
  return originalFilename.replace(/\.[^.]+$/, "").trim() || originalFilename;
}

function sanitizeFilename(filename: string) {
  return filename
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 180) || "document";
}

function buildDocumentStoragePath(companyId: string, folderId: string, documentId: string, filename: string) {
  return `/companies/${companyId}/folders/${folderId}/documents/${documentId}/${sanitizeFilename(filename)}`;
}

function checksumBuffer(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function checksumText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function filenameFromExternalReference(reference: string) {
  try {
    const url = new URL(reference);
    const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    return last || "external-document";
  } catch {
    return reference.split(/[\\/]/).filter(Boolean).pop() || "external-document";
  }
}

export async function discoverExternalFolder(folderReference: string): Promise<ExternalFolderEntry[]> {
  let root: URL;

  try {
    root = new URL(folderReference);
  } catch {
    throw new DocumentError("External folder must be a valid HTTP or HTTPS URL.");
  }

  if (!['http:', 'https:'].includes(root.protocol)) {
    throw new DocumentError("Only HTTP and HTTPS external folders are supported.");
  }

  if (!root.pathname.endsWith('/')) root.pathname += '/';
  const pending = [root];
  const visited = new Set<string>();
  const files = new Map<string, ExternalFolderEntry>();
  const maximumEntries = 500;

  while (pending.length > 0) {
    const directory = pending.shift()!;
    if (visited.has(directory.href)) continue;
    visited.add(directory.href);

    const response = await fetch(directory, { headers: { Accept: "text/html" }, redirect: "follow" });
    if (!response.ok) throw new DocumentError(`Unable to read external folder. HTTP ${response.status}.`, 400);

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new DocumentError("The folder URL must expose an HTML directory listing containing links to its files.");
    }

    const html = await response.text();
    const hrefPattern = /href\s*=\s*["']([^"'#?]+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = hrefPattern.exec(html))) {
      let candidate: URL;
      try {
        candidate = new URL(match[1], directory);
      } catch {
        continue;
      }

      if (candidate.origin !== root.origin || !candidate.pathname.startsWith(root.pathname)) continue;
      candidate.hash = "";
      candidate.search = "";
      if (candidate.pathname.endsWith('/')) {
        if (!visited.has(candidate.href)) pending.push(candidate);
        continue;
      }

      const originalFilename = decodeURIComponent(candidate.pathname.split('/').pop() ?? '');
      const fileType = originalFilename.split('.').pop()?.toLowerCase() ?? '';
      if (!isSupportedFileType(fileType)) continue;
      files.set(candidate.href, { externalSourceUrl: candidate.href, originalFilename, fileType });

      if (files.size > maximumEntries) {
        throw new DocumentError(`External folders may contain at most ${maximumEntries} supported files.`);
      }
    }
  }

  if (files.size === 0) {
    throw new DocumentError("No supported documents were found in the external folder.");
  }

  return Array.from(files.values());
}

async function assertFolderAccess(companyId: string, folderId: string, session: AdminSession) {
  const result = await getPool().query<{ company_id: string }>(
    "SELECT company_id FROM folders WHERE id = $1 AND deleted_at IS NULL",
    [folderId]
  );
  const folderCompanyId = result.rows[0]?.company_id;

  if (!folderCompanyId) {
    throw new DocumentError("Folder was not found.", 404);
  }

  if (folderCompanyId !== companyId) {
    throw new DocumentError("Document company must match the folder company.");
  }

  if (session.user.isAdminRole) {
    return;
  }

  const accessibleTopicIds = await getAccessibleTopicIds(session);

  if (!accessibleTopicIds?.has(folderId)) {
    throw new DocumentError("You do not have access to this folder.", 403);
  }
}

function mapDocument(row: {
  id: string;
  company_id: string;
  folder_id: string;
  folder_name: string;
  name: string;
  original_filename: string;
  file_type: DocumentFileType;
  mime_type: string | null;
  file_size: string | number;
  checksum: string;
  storage_path: string | null;
  storage_mode: DocumentStorageMode;
  external_source_url: string | null;
  external_source_reference: string | null;
  source_metadata_json: Record<string, unknown>;
  version: number;
  status: DocumentStatus;
  uploaded_by: string;
  uploaded_by_name: string;
  error_message: string | null;
  role_access_count?: string | number;
  user_access_count?: string | number;
  created_at: Date;
  updated_at: Date;
}, session?: AdminSession): DocumentRow {
  return {
    id: row.id,
    companyId: row.company_id,
    folderId: row.folder_id,
    folderName: row.folder_name,
    name: row.name,
    originalFilename: row.original_filename,
    fileType: row.file_type,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    checksum: row.checksum,
    storagePath: row.storage_path,
    storageMode: row.storage_mode,
    externalSourceUrl: row.external_source_url,
    externalSourceReference: row.external_source_reference,
    sourceMetadata: row.source_metadata_json ?? {},
    version: row.version,
    status: row.status,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    errorMessage: row.error_message,
    roleAccessCount: Number(row.role_access_count ?? 0),
    userAccessCount: Number(row.user_access_count ?? 0),
    canDelete: session ? session.user.isAdminRole || row.uploaded_by === session.user.id : false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDocumentVersion(row: {
  id: string;
  document_id: string;
  version_number: number;
  checksum: string;
  file_size: string | number;
  file_type: string;
  mime_type: string | null;
  status: string;
  storage_mode: DocumentStorageMode;
  storage_path: string | null;
  external_source_url: string | null;
  external_source_reference: string | null;
  source_metadata_json: Record<string, unknown>;
  parsed_file_path: string | null;
  page_count: number | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
}): DocumentVersionRow {
  return {
    id: row.id,
    documentId: row.document_id,
    versionNumber: row.version_number,
    checksum: row.checksum,
    fileSize: Number(row.file_size),
    fileType: row.file_type,
    mimeType: row.mime_type,
    status: row.status,
    storageMode: row.storage_mode,
    storagePath: row.storage_path,
    externalSourceUrl: row.external_source_url,
    externalSourceReference: row.external_source_reference,
    sourceMetadata: row.source_metadata_json ?? {},
    parsedFilePath: row.parsed_file_path,
    pageCount: row.page_count,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at
  };
}

async function insertDocumentVersionSnapshot(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, input: {
  documentId: string;
  companyId: string;
  folderId: string;
  versionNumber: number;
  name: string;
  originalFilename: string;
  fileType: string;
  mimeType: string | null;
  fileSize: number;
  checksum: string;
  status: DocumentStatus;
  storageMode: DocumentStorageMode;
  storagePath: string | null;
  externalSourceUrl: string | null;
  externalSourceReference: string | null;
  sourceMetadata: Record<string, unknown>;
  createdBy: string;
}) {
  await client.query(
    `
      INSERT INTO document_versions (
        document_id,
        company_id,
        folder_id,
        version_number,
        name,
        original_filename,
        file_type,
        mime_type,
        file_size,
        checksum,
        status,
        storage_mode,
        storage_path,
        external_source_url,
        external_source_reference,
        source_metadata_json,
        created_by
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11::document_status,
        $12::document_storage_mode,
        $13,
        $14,
        $15,
        $16::jsonb,
        $17
      )
      ON CONFLICT (document_id, version_number)
      DO UPDATE SET
        checksum = EXCLUDED.checksum,
        file_size = EXCLUDED.file_size,
        file_type = EXCLUDED.file_type,
        mime_type = EXCLUDED.mime_type,
        status = EXCLUDED.status,
        storage_mode = EXCLUDED.storage_mode,
        storage_path = EXCLUDED.storage_path,
        external_source_url = EXCLUDED.external_source_url,
        external_source_reference = EXCLUDED.external_source_reference,
        source_metadata_json = EXCLUDED.source_metadata_json
    `,
    [
      input.documentId,
      input.companyId,
      input.folderId,
      input.versionNumber,
      input.name,
      input.originalFilename,
      input.fileType,
      input.mimeType,
      input.fileSize,
      input.checksum,
      input.status,
      input.storageMode,
      input.storagePath,
      input.externalSourceUrl,
      input.externalSourceReference,
      JSON.stringify(input.sourceMetadata),
      input.createdBy
    ]
  );
}

async function findVersionTrackedDocument(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ id: string; version: number; checksum: string; storage_path: string | null; status: DocumentStatus }> }> }, input: {
  companyId: string;
  folderId: string;
  storageMode: DocumentStorageMode;
  originalFilename: string;
  externalSourceReference: string | null;
}) {
  if (input.storageMode === "managed_upload") {
    const result = await client.query(
      `
        SELECT id, version, checksum, storage_path, status
        FROM documents
        WHERE company_id = $1
          AND folder_id = $2
          AND storage_mode = 'managed_upload'::document_storage_mode
          AND lower(original_filename) = lower($3)
          AND status <> 'deleted'
        ORDER BY updated_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [input.companyId, input.folderId, input.originalFilename]
    );
    return result.rows[0] ?? null;
  }

  if (!input.externalSourceReference) {
    return null;
  }

  const result = await client.query(
    `
      SELECT id, version, checksum, storage_path, status
      FROM documents
      WHERE company_id = $1
        AND folder_id = $2
        AND storage_mode <> 'managed_upload'::document_storage_mode
        AND external_source_reference = $3
        AND status <> 'deleted'
      ORDER BY updated_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [input.companyId, input.folderId, input.externalSourceReference]
  );
  return result.rows[0] ?? null;
}

const documentSelect = `
  SELECT
    documents.id,
    documents.company_id,
    documents.folder_id,
    folders.name AS folder_name,
    documents.name,
    documents.original_filename,
    documents.file_type,
    documents.mime_type,
    documents.file_size,
    documents.checksum,
    documents.storage_path,
    documents.storage_mode,
    documents.external_source_url,
    documents.external_source_reference,
    documents.source_metadata_json,
    documents.version,
    documents.status,
    documents.uploaded_by,
    users.name AS uploaded_by_name,
    documents.error_message,
    (
      SELECT COUNT(*)
      FROM document_role_permissions
      WHERE document_role_permissions.document_id = documents.id
        AND document_role_permissions.deleted_at IS NULL
    ) AS role_access_count,
    (
      SELECT COUNT(*)
      FROM document_user_permissions
      WHERE document_user_permissions.document_id = documents.id
        AND document_user_permissions.deleted_at IS NULL
    ) AS user_access_count,
    documents.created_at,
    documents.updated_at
  FROM documents
  INNER JOIN folders ON folders.id = documents.folder_id
  INNER JOIN users ON users.id = documents.uploaded_by
`;

export async function createDocument(input: CreateDocumentInput, session: AdminSession) {
  const originalFilename = input.originalFilename.trim();
  const storageMode = input.storageMode?.trim() || "managed_upload";
  const externalSourceUrl = input.externalSourceUrl?.trim() || null;
  const externalSourceReference = input.externalSourceReference?.trim() || externalSourceUrl;
  const checksum = (input.checksum || (storageMode === "managed_upload" ? "" : checksumText(`${input.companyId}:${input.folderId}:${externalSourceReference || originalFilename}`))).trim().toLowerCase();
  const fileType = normalizeFileType(input);
  const name = input.name?.trim() || defaultDocumentName(originalFilename);
  const fileSize = Number(input.fileSize);
  const version = Number(input.version ?? 1);
  const status = input.status ?? "uploaded";

  if (!input.companyId || !input.folderId || !originalFilename || !checksum || !name) {
    throw new DocumentError("Company, folder, filename, checksum, and name are required.");
  }

  if (!isDocumentStorageMode(storageMode)) {
    throw new DocumentError("Invalid document storage mode.");
  }

  if (storageMode !== "managed_upload" && !externalSourceReference) {
    throw new DocumentError("External source reference is required.");
  }

  if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
    throw new DocumentError("File size is invalid.");
  }

  if (!Number.isSafeInteger(version) || version < 1) {
    throw new DocumentError("Version is invalid.");
  }

  if (!isSupportedFileType(fileType)) {
    throw new DocumentError("Unsupported file type.");
  }

  if (!isDocumentStatus(status) || status === "deleted") {
    throw new DocumentError("Invalid document status.");
  }

  await assertFolderAccess(input.companyId, input.folderId, session);

  const sourceMetadata = input.sourceMetadata ?? {};
  const storagePath = storageMode === "managed_upload" ? input.storagePath?.trim() || null : null;
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const existing = await findVersionTrackedDocument(client, {
      companyId: input.companyId,
      folderId: input.folderId,
      storageMode,
      originalFilename,
      externalSourceReference
    });

    if (existing) {
      if (existing.checksum.toLowerCase() === checksum) {
        await client.query(
          `
            UPDATE documents
            SET
              name = $2,
              mime_type = $3,
              file_size = $4,
              status = $5::document_status,
              external_source_url = $6,
              external_source_reference = $7,
              source_metadata_json = $8::jsonb,
              updated_at = now()
            WHERE id = $1
          `,
          [
            existing.id,
            name,
            input.mimeType?.trim() || null,
            fileSize,
            status,
            externalSourceUrl,
            externalSourceReference,
            JSON.stringify(sourceMetadata)
          ]
        );

        await insertDocumentVersionSnapshot(client, {
          documentId: existing.id,
          companyId: input.companyId,
          folderId: input.folderId,
          versionNumber: existing.version,
          name,
          originalFilename,
          fileType,
          mimeType: input.mimeType?.trim() || null,
          fileSize,
          checksum,
          status,
          storageMode,
          storagePath: existing.storage_path,
          externalSourceUrl,
          externalSourceReference,
          sourceMetadata,
          createdBy: session.user.id
        });

        await client.query("COMMIT");
        return getDocumentById(existing.id, session);
      }

      const nextVersion = existing.version + 1;

      await client.query(
        `
          UPDATE documents
          SET
            name = $2,
            original_filename = $3,
            file_type = $4,
            mime_type = $5,
            file_size = $6,
            checksum = $7,
            storage_path = $8,
            storage_mode = $9::document_storage_mode,
            external_source_url = $10,
            external_source_reference = $11,
            source_metadata_json = $12::jsonb,
            version = $13,
            status = $14::document_status,
            uploaded_by = $15,
            error_message = NULL,
            updated_at = now()
          WHERE id = $1
        `,
        [
          existing.id,
          name,
          originalFilename,
          fileType,
          input.mimeType?.trim() || null,
          fileSize,
          checksum,
          storagePath ?? existing.storage_path,
          storageMode,
          externalSourceUrl,
          externalSourceReference,
          JSON.stringify(sourceMetadata),
          nextVersion,
          status,
          session.user.id
        ]
      );

      await insertDocumentVersionSnapshot(client, {
        documentId: existing.id,
        companyId: input.companyId,
        folderId: input.folderId,
        versionNumber: nextVersion,
        name,
        originalFilename,
        fileType,
        mimeType: input.mimeType?.trim() || null,
        fileSize,
        checksum,
        status,
        storageMode,
        storagePath: storagePath ?? existing.storage_path,
        externalSourceUrl,
        externalSourceReference,
        sourceMetadata,
        createdBy: session.user.id
      });

      await client.query("COMMIT");
      return getDocumentById(existing.id, session);
    }

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO documents (
          company_id,
          folder_id,
          name,
          original_filename,
          file_type,
          mime_type,
          file_size,
          checksum,
          storage_path,
          storage_mode,
          external_source_url,
          external_source_reference,
          source_metadata_json,
          version,
          status,
          uploaded_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::document_storage_mode, $11, $12, $13::jsonb, $14, $15::document_status, $16)
        RETURNING id
      `,
      [
        input.companyId,
        input.folderId,
        name,
        originalFilename,
        fileType,
        input.mimeType?.trim() || null,
        fileSize,
        checksum,
        storagePath,
        storageMode,
        externalSourceUrl,
        externalSourceReference,
        JSON.stringify(sourceMetadata),
        version,
        status,
        session.user.id
      ]
    );

    await insertDocumentVersionSnapshot(client, {
      documentId: result.rows[0].id,
      companyId: input.companyId,
      folderId: input.folderId,
      versionNumber: version,
      name,
      originalFilename,
      fileType,
      mimeType: input.mimeType?.trim() || null,
      fileSize,
      checksum,
      status,
      storageMode,
      storagePath,
      externalSourceUrl,
      externalSourceReference,
      sourceMetadata,
      createdBy: session.user.id
    });

    await client.query("COMMIT");
    return getDocumentById(result.rows[0].id, session);
  } catch (error) {
    await client.query("ROLLBACK");
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new DocumentError("A document with the same checksum already exists for this company.", 409);
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function registerExternalDocument(input: CreateDocumentInput, session: AdminSession) {
  const storageMode = input.storageMode || "external_reference";

  if (storageMode === "managed_upload") {
    throw new DocumentError("External document registration requires an external storage mode.");
  }

  const sourceReference = input.externalSourceUrl || input.externalSourceReference || "";
  const originalFilename = input.originalFilename?.trim() || filenameFromExternalReference(sourceReference);
  const fileType = input.fileType || originalFilename.split(".").pop()?.toLowerCase() || "";

  const checksum = input.checksum || checksumText(`${input.companyId}:${input.folderId}:${sourceReference}`);
  let document: DocumentRow;
  try {
    document = await createDocument(
      {
        ...input,
        originalFilename,
        fileType,
        fileSize: Number(input.fileSize ?? 0),
        checksum,
        storageMode,
        status: "queued"
      },
      session
    );
  } catch (error) {
    if (!(error instanceof DocumentError) || error.statusCode !== 409) throw error;
    const existingResult = await getPool().query<{ id: string }>(`
      SELECT id FROM documents
      WHERE company_id = $1 AND checksum = $2 AND status <> 'deleted'
      LIMIT 1
    `, [input.companyId, checksum.toLowerCase()]);
    if (!existingResult.rows[0]) throw error;
    document = await getDocumentById(existingResult.rows[0].id, session);
    return document;
  }

  await enqueueProcessingJob({
    companyId: document.companyId,
    documentId: document.id,
    jobType: "parse_document",
    maxAttempts: 3
  });

  return document;
}

export async function uploadDocuments(input: { companyId: string; folderId: string; files: UploadDocumentFile[] }, session: AdminSession) {
  if (!input.companyId || !input.folderId) {
    throw new DocumentError("Company and folder are required.");
  }

  if (input.files.length === 0) {
    throw new DocumentError("Select at least one file.");
  }

  const storage = getStorageProvider();

  return Promise.all(input.files.map(async (file) => {
    const buffer = Buffer.from(await file.arrayBuffer());
    const checksum = checksumBuffer(buffer);
    const document = await createDocument(
      {
        companyId: input.companyId,
        folderId: input.folderId,
        originalFilename: file.name,
        fileType: file.name.split(".").pop()?.toLowerCase(),
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        checksum,
        status: "queued"
      },
      session
    );
    const storagePath = buildDocumentStoragePath(input.companyId, input.folderId, document.id, file.name);

    try {
      await storage.save_file(buffer, storagePath);
      const uploadedDocument = await updateDocument(
        document.id,
        {
          storagePath,
          status: "uploaded",
          errorMessage: null
        },
        session
      );
      await enqueueProcessingJob({
        companyId: uploadedDocument.companyId,
        documentId: uploadedDocument.id,
        jobType: "parse_document",
        maxAttempts: 3
      });
      return uploadedDocument;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save file to storage.";
      try {
        if (await storage.file_exists(storagePath)) {
          await storage.delete_file(storagePath);
        }
      } catch {
        // Keep the original storage failure visible to the user.
      }
      await updateDocument(
        document.id,
        {
          status: "failed",
          errorMessage: message
        },
        session
      );
      throw new DocumentError(`Unable to store "${file.name}": ${message}`, 500);
    }
  }));
}

export async function listDocuments(filters: DocumentFilters, session: AdminSession) {
  const requestedPage = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 20));
  const conditions = ["documents.status <> 'deleted'"];
  const params: unknown[] = [];
  const accessibleTopicIds = await getAccessibleTopicIds(session);

  if (accessibleTopicIds) {
    params.push(Array.from(accessibleTopicIds));
    conditions.push(`documents.folder_id = ANY($${params.length}::uuid[])`);
  }

  if (filters.folderId) {
    params.push(filters.folderId);
    conditions.push(`documents.folder_id = $${params.length}`);
  }

  if (filters.status) {
    if (!isDocumentStatus(filters.status) || filters.status === "deleted") {
      throw new DocumentError("Invalid document status.");
    }

    params.push(filters.status);
    conditions.push(`documents.status = $${params.length}::document_status`);
  }

  if (filters.fileType) {
    const fileType = filters.fileType.toLowerCase();

    if (!isSupportedFileType(fileType)) {
      throw new DocumentError("Invalid file type.");
    }

    params.push(fileType);
    conditions.push(`documents.file_type = $${params.length}`);
  }

  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    conditions.push(`(documents.name ILIKE $${params.length} OR documents.original_filename ILIKE $${params.length})`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countResult = await getPool().query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM documents ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * pageSize;
  const dataParams = [...params, pageSize, offset];
  const documentsResult = await getPool().query(
    `
      ${documentSelect}
      ${whereClause}
      ORDER BY documents.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    dataParams
  );
  return {
    documents: documentsResult.rows.map((row) => mapDocument(row, session)),
    page,
    pageCount,
    pageSize,
    total
  };
}

export async function getDocumentById(id: string, session: AdminSession) {
  if (!id) {
    throw new DocumentError("Document is required.");
  }

  const result = await getPool().query(`${documentSelect} WHERE documents.id = $1`, [id]);
  const document = result.rows[0] ? mapDocument(result.rows[0], session) : null;

  if (!document || document.status === "deleted") {
    throw new DocumentError("Document was not found.", 404);
  }

  await assertFolderAccess(document.companyId, document.folderId, session);
  return document;
}

export async function listDocumentVersions(documentId: string, session: AdminSession) {
  const document = await getDocumentById(documentId, session);

  const result = await getPool().query(
    `
      SELECT
        document_versions.id,
        document_versions.document_id,
        document_versions.version_number,
        document_versions.checksum,
        document_versions.file_size,
        document_versions.file_type,
        document_versions.mime_type,
        document_versions.status,
        document_versions.storage_mode,
        document_versions.storage_path,
        document_versions.external_source_url,
        document_versions.external_source_reference,
        document_versions.source_metadata_json,
        document_versions.parsed_file_path,
        document_versions.page_count,
        document_versions.created_by,
        users.name AS created_by_name,
        document_versions.created_at
      FROM document_versions
      LEFT JOIN users ON users.id = document_versions.created_by
      WHERE document_versions.document_id = $1
      ORDER BY document_versions.version_number DESC
    `,
    [document.id]
  );

  return {
    document,
    versions: result.rows.map((row) => mapDocumentVersion(row))
  };
}

function normalizeComparisonText(value: string | null) {
  if (!value) return [] as string[];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export async function compareDocumentVersions(documentId: string, fromVersion: number, toVersion: number, session: AdminSession): Promise<DocumentVersionComparison> {
  const document = await getDocumentById(documentId, session);

  const versionsResult = await getPool().query<{
    version_number: number;
    checksum: string;
    page_count: number | null;
    content_text: string | null;
  }>(
    `
      SELECT version_number, checksum, page_count, content_text
      FROM document_versions
      WHERE document_id = $1
        AND version_number = ANY($2::int[])
    `,
    [document.id, [fromVersion, toVersion]]
  );

  const from = versionsResult.rows.find((row) => row.version_number === fromVersion);
  const to = versionsResult.rows.find((row) => row.version_number === toVersion);

  if (!from || !to) {
    throw new DocumentError("Requested document versions were not found.", 404);
  }

  const fromLines = normalizeComparisonText(from.content_text);
  const toLines = normalizeComparisonText(to.content_text);
  const fromSet = new Set(fromLines);
  const toSet = new Set(toLines);
  const added = Array.from(toSet).filter((line) => !fromSet.has(line));
  const removed = Array.from(fromSet).filter((line) => !toSet.has(line));

  return {
    fromVersion,
    toVersion,
    identical: from.checksum === to.checksum,
    fromChecksum: from.checksum,
    toChecksum: to.checksum,
    stats: {
      fromLineCount: fromLines.length,
      toLineCount: toLines.length,
      addedLines: added.length,
      removedLines: removed.length,
      pageCountDelta: Number(to.page_count ?? 0) - Number(from.page_count ?? 0)
    },
    addedPreview: added.slice(0, 50),
    removedPreview: removed.slice(0, 50)
  };
}

function buildChangeSummarySystemPrompt() {
  return [
    "You summarize differences between document versions for enterprise admins.",
    "Use only the provided comparison data.",
    "Do not invent changes.",
    "Return concise markdown with sections: Overview, Added, Removed, Impact.",
    "If there are no meaningful changes, explicitly say that."
  ].join(" ");
}

function buildChangeSummaryUserPrompt(comparison: DocumentVersionComparison) {
  return [
    `Summarize document changes from version ${comparison.fromVersion} to ${comparison.toVersion}.`,
    "Focus on actionable differences for knowledge quality and retrieval impact."
  ].join(" ");
}

function buildChangeSummaryContext(comparison: DocumentVersionComparison) {
  const stats = comparison.stats;
  const addedPreview = comparison.addedPreview.length
    ? comparison.addedPreview.map((line, index) => `${index + 1}. ${line}`).join("\n")
    : "None";
  const removedPreview = comparison.removedPreview.length
    ? comparison.removedPreview.map((line, index) => `${index + 1}. ${line}`).join("\n")
    : "None";

  return [
    `From version: ${comparison.fromVersion}`,
    `To version: ${comparison.toVersion}`,
    `Identical checksums: ${comparison.identical ? "yes" : "no"}`,
    `From checksum: ${comparison.fromChecksum}`,
    `To checksum: ${comparison.toChecksum}`,
    `From line count: ${stats.fromLineCount}`,
    `To line count: ${stats.toLineCount}`,
    `Added lines: ${stats.addedLines}`,
    `Removed lines: ${stats.removedLines}`,
    `Page count delta: ${stats.pageCountDelta}`,
    "Added preview:",
    addedPreview,
    "Removed preview:",
    removedPreview
  ].join("\n");
}

export async function generateDocumentVersionChangeSummary(
  documentId: string,
  fromVersion: number,
  toVersion: number,
  session: AdminSession
): Promise<{ comparison: DocumentVersionComparison; summary: DocumentVersionChangeSummary }> {
  const comparison = await compareDocumentVersions(documentId, fromVersion, toVersion, session);

  if (comparison.identical || (comparison.stats.addedLines === 0 && comparison.stats.removedLines === 0)) {
    return {
      comparison,
      summary: {
        fromVersion,
        toVersion,
        summary: "## Overview\nNo meaningful textual changes were detected between these versions.\n\n## Added\nNone.\n\n## Removed\nNone.\n\n## Impact\nRetrieval behavior is expected to remain stable for this document.",
        provider: "deterministic",
        model: "rule-based",
        generatedAt: new Date().toISOString()
      }
    };
  }

  const provider = await getLLMProvider();
  const aiSummary = await provider.generate_answer(
    buildChangeSummarySystemPrompt(),
    buildChangeSummaryUserPrompt(comparison),
    buildChangeSummaryContext(comparison)
  );

  return {
    comparison,
    summary: {
      fromVersion,
      toVersion,
      summary: aiSummary.trim() || "No summary could be generated.",
      provider: provider.provider,
      model: provider.model,
      generatedAt: new Date().toISOString()
    }
  };
}

export async function updateDocument(id: string, input: UpdateDocumentInput, session: AdminSession) {
  const existing = await getDocumentById(id, session);
  const fields: string[] = [];
  const params: unknown[] = [id];

  if (typeof input.name === "string") {
    const name = input.name.trim();

    if (!name) {
      throw new DocumentError("Document name is required.");
    }

    params.push(name);
    fields.push(`name = $${params.length}`);
  }

  if (typeof input.status === "string") {
    if (!isDocumentStatus(input.status)) {
      throw new DocumentError("Invalid document status.");
    }

    params.push(input.status);
    fields.push(`status = $${params.length}::document_status`);
  }

  if (typeof input.version !== "undefined") {
    const version = Number(input.version);

    if (!Number.isSafeInteger(version) || version < 1) {
      throw new DocumentError("Version is invalid.");
    }

    params.push(version);
    fields.push(`version = $${params.length}`);
  }

  if (typeof input.errorMessage !== "undefined") {
    params.push(input.errorMessage?.trim() || null);
    fields.push(`error_message = $${params.length}`);
  }

  if (typeof input.storagePath !== "undefined") {
    params.push(input.storagePath?.trim() || null);
    fields.push(`storage_path = $${params.length}`);
  }

  if (fields.length === 0) {
    return existing;
  }

  await getPool().query(
    `
      UPDATE documents
      SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $1 AND status <> 'deleted'
    `,
    params
  );

  if (typeof input.status !== "undefined" || typeof input.storagePath !== "undefined") {
    const versionNumber = typeof input.version === "number" ? input.version : existing.version;
    await getPool().query(
      `
        UPDATE document_versions
        SET
          status = COALESCE($3::document_status, status),
          storage_path = COALESCE($4, storage_path)
        WHERE document_id = $1
          AND version_number = $2
      `,
      [
        id,
        versionNumber,
        typeof input.status === "string" && isDocumentStatus(input.status) ? input.status : null,
        typeof input.storagePath !== "undefined" ? input.storagePath?.trim() || null : null
      ]
    );
  }

  return getDocumentById(id, session);
}

export async function deleteDocument(id: string, session: AdminSession) {
  const existing = await getDocumentById(id, session);
  const storage = getStorageProvider();

  if (!session.user.isAdminRole && existing.uploadedBy !== session.user.id) {
    throw new DocumentError("Only admin users and the uploader can delete this document.", 403);
  }

  const result = await getPool().query(
    "UPDATE documents SET status = 'deleted', updated_at = now() WHERE id = $1 AND status <> 'deleted'",
    [existing.id]
  );

  if (result.rowCount !== 1) {
    throw new DocumentError("Document was not found.", 404);
  }

  if (existing.storagePath) {
    await storage.delete_file(existing.storagePath);
  }
}

export async function getDocumentDownload(id: string, session: AdminSession) {
  const document = await getDocumentById(id, session);

  if (document.storageMode !== "managed_upload") {
    throw new DocumentError("This content was imported from an external source. Scout does not store a downloadable copy of the original file.", 409);
  }

  if (!document.storagePath) {
    throw new DocumentError("The original file is not available in storage.", 404);
  }

  const storage = getStorageProvider();

  if (!(await storage.file_exists(document.storagePath))) {
    throw new DocumentError("Document file was not found in storage.", 404);
  }

  return {
    document,
    file: await storage.get_file(document.storagePath)
  };
}

export async function getDocumentAccess(documentId: string, session: AdminSession) {
  const document = await getDocumentById(documentId, session);
  const [roles, users] = await Promise.all([
    getPool().query<{ role_id: string }>(
      "SELECT role_id FROM document_role_permissions WHERE document_id = $1 AND deleted_at IS NULL",
      [document.id]
    ),
    getPool().query<{ user_id: string }>(
      "SELECT user_id FROM document_user_permissions WHERE document_id = $1 AND deleted_at IS NULL",
      [document.id]
    )
  ]);

  return {
    documentId: document.id,
    isCustom: roles.rows.length > 0 || users.rows.length > 0,
    roleIds: roles.rows.map((row) => row.role_id),
    userIds: users.rows.map((row) => row.user_id)
  };
}

export async function replaceDocumentAccess(
  documentId: string,
  input: { roleIds?: string[]; userIds?: string[] },
  session: AdminSession
) {
  const document = await getDocumentById(documentId, session);
  await assertFolderAccess(document.companyId, document.folderId, session);

  const roleIds = Array.from(new Set(input.roleIds ?? []));
  const userIds = Array.from(new Set(input.userIds ?? []));
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE document_role_permissions SET deleted_at = now(), updated_by = $2, updated_at = now() WHERE document_id = $1 AND deleted_at IS NULL",
      [document.id, session.user.id]
    );
    await client.query(
      "UPDATE document_user_permissions SET deleted_at = now(), updated_by = $2, updated_at = now() WHERE document_id = $1 AND deleted_at IS NULL",
      [document.id, session.user.id]
    );

    if (roleIds.length > 0) {
      await client.query(
        `
          INSERT INTO document_role_permissions (company_id, document_id, role_id, created_by, updated_by)
          SELECT $1, $2, role_id, $3, $3
          FROM unnest($4::uuid[]) AS role_id
          ON CONFLICT (document_id, role_id)
          DO UPDATE SET deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
        `,
        [document.companyId, document.id, session.user.id, roleIds]
      );
    }

    if (userIds.length > 0) {
      await client.query(
        `
          INSERT INTO document_user_permissions (company_id, document_id, user_id, created_by, updated_by)
          SELECT $1, $2, user_id, $3, $3
          FROM unnest($4::uuid[]) AS user_id
          ON CONFLICT (document_id, user_id)
          DO UPDATE SET deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
        `,
        [document.companyId, document.id, session.user.id, userIds]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getDocumentAccess(document.id, session);
}
