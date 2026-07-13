import { getPool } from "@/lib/db/pool";
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
    "SELECT company_id FROM topics WHERE id = $1 AND deleted_at IS NULL",
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

const documentSelect = `
  SELECT
    documents.id,
    documents.company_id,
    documents.folder_id,
    topics.name AS folder_name,
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
  INNER JOIN topics ON topics.id = documents.folder_id
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

  try {
    const result = await getPool().query<{ id: string }>(
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
        storageMode === "managed_upload" ? input.storagePath?.trim() || null : null,
        storageMode,
        externalSourceUrl,
        externalSourceReference,
        JSON.stringify(input.sourceMetadata ?? {}),
        version,
        status,
        session.user.id
      ]
    );

    return getDocumentById(result.rows[0].id, session);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new DocumentError("A document with the same checksum already exists for this company.", 409);
    }

    throw error;
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

  const document = await createDocument(
    {
      ...input,
      originalFilename,
      fileType,
      fileSize: Number(input.fileSize ?? 0),
      checksum: input.checksum || checksumText(`${input.companyId}:${input.folderId}:${sourceReference}`),
      storageMode,
      status: "queued"
    },
    session
  );

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

  if (!document.storagePath) {
    throw new DocumentError("Document file is not available for download.", 404);
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
