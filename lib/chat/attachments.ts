import crypto from "node:crypto";
import { getPool } from "@/lib/db/pool";
import { getStorageProvider } from "@/lib/storage/provider";
import { sanitizeFilename, checksumBuffer } from "@/lib/admin/documents";

// Deliberately narrower than SUPPORTED_DOCUMENT_FILE_TYPES (lib/admin/documents.ts):
// only types with a real parser (lib/document-processing/parsers.ts) and low
// injection risk. No images/pptx/xlsx/epub/zip (no real parser exists for these
// yet), no html (script-injection risk from anonymous chat uploaders).
export const CHAT_ATTACHMENT_ALLOWED_FILE_TYPES = ["pdf", "docx", "csv", "txt", "json", "xml"] as const;
export type ChatAttachmentFileType = typeof CHAT_ATTACHMENT_ALLOWED_FILE_TYPES[number];

export const MAX_CHAT_ATTACHMENT_SIZE_BYTES = Number(process.env.MAX_CHAT_ATTACHMENT_SIZE_BYTES) || 10 * 1024 * 1024;

const RATE_LIMIT_MAX_UPLOADS = Number(process.env.CHAT_ATTACHMENT_RATE_LIMIT_MAX) || 10;
const RATE_LIMIT_WINDOW_SECONDS = Number(process.env.CHAT_ATTACHMENT_RATE_LIMIT_WINDOW_SECONDS) || 3600;

export class ChatAttachmentError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ChatAttachmentError";
    this.statusCode = statusCode;
  }
}

export type ChatAttachmentRow = {
  id: string;
  targetAppId: string;
  conversationId: string | null;
  uploadedByUserId: string | null;
  originalFilename: string;
  fileType: ChatAttachmentFileType;
  mimeType: string | null;
  fileSize: number;
  checksum: string;
  storagePath: string;
  status: "uploaded" | "failed";
  createdAt: Date;
  updatedAt: Date;
};

function isAllowedFileType(value: string): value is ChatAttachmentFileType {
  return (CHAT_ATTACHMENT_ALLOWED_FILE_TYPES as readonly string[]).includes(value);
}

function mapRow(row: {
  id: string;
  target_app_id: string;
  conversation_id: string | null;
  uploaded_by_user_id: string | null;
  original_filename: string;
  file_type: ChatAttachmentFileType;
  mime_type: string | null;
  file_size: string | number;
  checksum: string;
  storage_path: string;
  status: "uploaded" | "failed";
  created_at: Date;
  updated_at: Date;
}): ChatAttachmentRow {
  return {
    id: row.id,
    targetAppId: row.target_app_id,
    conversationId: row.conversation_id,
    uploadedByUserId: row.uploaded_by_user_id,
    originalFilename: row.original_filename,
    fileType: row.file_type,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    checksum: row.checksum,
    storagePath: row.storage_path,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildChatAttachmentStoragePath(companyId: string, conversationId: string | null, attachmentId: string, filename: string) {
  const conversationSegment = conversationId || "anon";
  return `/companies/${companyId}/chat-attachments/${conversationSegment}/${attachmentId}/${sanitizeFilename(filename)}`;
}

export async function enforceChatAttachmentRateLimit(targetAppId: string, clientKey: string): Promise<void> {
  const pool = getPool();

  await pool.query(`DELETE FROM chat_attachment_rate_limit_windows WHERE updated_at < now() - interval '1 day'`);

  const result = await pool.query<{ upload_count: number }>(
    `
      INSERT INTO chat_attachment_rate_limit_windows (target_app_id, client_key, window_start, upload_count, updated_at)
      VALUES (
        $1,
        $2,
        to_timestamp(floor(extract(epoch from now()) / $3) * $3),
        1,
        now()
      )
      ON CONFLICT (target_app_id, client_key, window_start)
      DO UPDATE SET upload_count = chat_attachment_rate_limit_windows.upload_count + 1, updated_at = now()
      RETURNING upload_count
    `,
    [targetAppId, clientKey, RATE_LIMIT_WINDOW_SECONDS]
  );

  const count = result.rows[0]?.upload_count ?? 0;

  if (count > RATE_LIMIT_MAX_UPLOADS) {
    throw new ChatAttachmentError("Too many file uploads. Please wait a while before trying again.", 429);
  }
}

export async function createChatAttachment(input: {
  companyId: string;
  targetAppId: string;
  conversationId?: string | null;
  uploadedByUserId?: string | null;
  originalFilename: string;
  mimeType?: string | null;
  buffer: Buffer;
}): Promise<ChatAttachmentRow> {
  const originalFilename = input.originalFilename.trim();
  const fileType = originalFilename.split(".").pop()?.toLowerCase() ?? "";

  if (!originalFilename) {
    throw new ChatAttachmentError("A file name is required.");
  }

  if (!isAllowedFileType(fileType)) {
    throw new ChatAttachmentError(
      `Unsupported file type. Allowed types: ${CHAT_ATTACHMENT_ALLOWED_FILE_TYPES.join(", ")}.`
    );
  }

  if (input.buffer.length === 0) {
    throw new ChatAttachmentError("The uploaded file is empty.");
  }

  if (input.buffer.length > MAX_CHAT_ATTACHMENT_SIZE_BYTES) {
    throw new ChatAttachmentError(
      `File is too large. Maximum size is ${Math.floor(MAX_CHAT_ATTACHMENT_SIZE_BYTES / (1024 * 1024))} MB.`,
      413
    );
  }

  const checksum = checksumBuffer(input.buffer);
  const attachmentId = crypto.randomUUID();
  const storagePath = buildChatAttachmentStoragePath(input.companyId, input.conversationId ?? null, attachmentId, originalFilename);

  const storage = getStorageProvider();
  await storage.save_file(input.buffer, storagePath);

  const result = await getPool().query(
    `
      INSERT INTO chat_attachments (
        id, target_app_id, conversation_id, uploaded_by_user_id,
        original_filename, file_type, mime_type, file_size, checksum, storage_path, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'uploaded')
      RETURNING *
    `,
    [
      attachmentId,
      input.targetAppId,
      input.conversationId || null,
      input.uploadedByUserId || null,
      originalFilename,
      fileType,
      input.mimeType || null,
      input.buffer.length,
      checksum,
      storagePath
    ]
  );

  return mapRow(result.rows[0]);
}

// Tenant-scoped lookup: never resolve an attachment id without confirming it
// belongs to the requesting company. Used by trigger wiring before an
// orchestration is allowed to read the file.
export async function getChatAttachmentById(id: string, companyId: string): Promise<ChatAttachmentRow | null> {
  const result = await getPool().query(
    `
      SELECT ca.*
      FROM chat_attachments ca
      INNER JOIN company_target_applications cta ON cta.id = ca.target_app_id
      WHERE ca.id = $1 AND cta.company_id = $2 AND ca.deleted_at IS NULL
    `,
    [id, companyId]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
