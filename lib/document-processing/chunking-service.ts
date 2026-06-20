import { getPool } from "@/lib/db/pool";
import { getStorageProvider } from "@/lib/storage/provider";
import { enqueueProcessingJob } from "@/lib/admin/processing-jobs";
import type { ParsedDocumentOutput } from "./parsers";

const CHUNK_TOKEN_SIZE = 850;
const CHUNK_TOKEN_OVERLAP = 125;

type DocumentForChunking = {
  id: string;
  company_id: string;
  folder_id: string;
  name: string;
  file_type: string;
  parsed_file_path: string;
};

function tokenize(text: string) {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

function folderPathExpression() {
  return `
    WITH RECURSIVE folder_tree AS (
      SELECT id, parent_id, name, 0 AS depth
      FROM topics
      WHERE id = $1 AND deleted_at IS NULL
      UNION ALL
      SELECT parent.id, parent.parent_id, parent.name, folder_tree.depth + 1
      FROM topics parent
      INNER JOIN folder_tree ON folder_tree.parent_id = parent.id
      WHERE parent.deleted_at IS NULL
    )
    SELECT string_agg(name, ' / ' ORDER BY depth DESC) AS folder_path
    FROM folder_tree
  `;
}

async function getFolderPath(folderId: string) {
  const result = await getPool().query<{ folder_path: string | null }>(folderPathExpression(), [folderId]);
  return result.rows[0]?.folder_path ?? "";
}

function createChunks(document: DocumentForChunking, folderPath: string, parsed: ParsedDocumentOutput) {
  const chunks: Array<{
    chunkIndex: number;
    content: string;
    pageNumber: number;
    sectionTitle: string | null;
    tokenCount: number;
    metadata: Record<string, unknown>;
  }> = [];
  let chunkIndex = 0;

  for (const page of parsed.pages) {
    const tokens = tokenize(page.text);

    if (tokens.length === 0) {
      continue;
    }

    for (let start = 0; start < tokens.length; start += CHUNK_TOKEN_SIZE - CHUNK_TOKEN_OVERLAP) {
      const chunkTokens = tokens.slice(start, start + CHUNK_TOKEN_SIZE);

      if (chunkTokens.length === 0) {
        break;
      }

      chunks.push({
        chunkIndex,
        content: chunkTokens.join(" "),
        pageNumber: page.page_number,
        sectionTitle: parsed.title || null,
        tokenCount: chunkTokens.length,
        metadata: {
          document_name: document.name,
          folder_path: folderPath,
          file_type: document.file_type,
          page_number: page.page_number
        }
      });
      chunkIndex += 1;

      if (start + CHUNK_TOKEN_SIZE >= tokens.length) {
        break;
      }
    }
  }

  return chunks;
}

async function loadDocument(documentId: string) {
  const result = await getPool().query<DocumentForChunking>(
    `
      SELECT
        documents.id,
        documents.company_id,
        documents.folder_id,
        documents.name,
        documents.file_type,
        document_parsed_contents.parsed_file_path
      FROM documents
      INNER JOIN document_parsed_contents ON document_parsed_contents.document_id = documents.id
      WHERE documents.id = $1
        AND documents.status <> 'deleted'
    `,
    [documentId]
  );

  const document = result.rows[0];

  if (!document) {
    throw new Error("Parsed document was not found.");
  }

  return document;
}

export async function chunkDocumentById(documentId: string) {
  const document = await loadDocument(documentId);
  const storage = getStorageProvider();
  const parsedFile = await storage.get_file(document.parsed_file_path);
  const parsed = JSON.parse(parsedFile.toString("utf8")) as ParsedDocumentOutput;
  const folderPath = await getFolderPath(document.folder_id);
  const chunks = createChunks(document, folderPath, parsed);
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE documents SET status = 'processing', error_message = NULL, updated_at = now() WHERE id = $1",
      [document.id]
    );
    await client.query("DELETE FROM document_chunks WHERE document_id = $1", [document.id]);

    if (chunks.length > 0) {
      await client.query(
        `
          INSERT INTO document_chunks (
            company_id,
            document_id,
            folder_id,
            chunk_index,
            content,
            page_number,
            section_title,
            token_count,
            metadata_json
          )
          SELECT
            $1,
            $2,
            $3,
            chunk_index,
            content,
            page_number,
            section_title,
            token_count,
            metadata_json::jsonb
          FROM unnest(
            $4::integer[],
            $5::text[],
            $6::integer[],
            $7::text[],
            $8::integer[],
            $9::text[]
          ) AS chunk_rows(chunk_index, content, page_number, section_title, token_count, metadata_json)
        `,
        [
          document.company_id,
          document.id,
          document.folder_id,
          chunks.map((chunk) => chunk.chunkIndex),
          chunks.map((chunk) => chunk.content),
          chunks.map((chunk) => chunk.pageNumber),
          chunks.map((chunk) => chunk.sectionTitle),
          chunks.map((chunk) => chunk.tokenCount),
          chunks.map((chunk) => JSON.stringify(chunk.metadata))
        ]
      );
    }

    await client.query(
      "UPDATE documents SET status = 'chunked', error_message = NULL, updated_at = now() WHERE id = $1",
      [document.id]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await enqueueProcessingJob({
    companyId: document.company_id,
    documentId: document.id,
    jobType: "embed_document",
    maxAttempts: 3
  });

  return { chunkCount: chunks.length };
}
