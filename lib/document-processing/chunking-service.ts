import { getPool } from "@/lib/db/pool";
import { getStorageProvider } from "@/lib/storage/provider";
import { enqueueProcessingJob } from "@/lib/admin/processing-jobs";
import type { ParsedDocumentOutput } from "./parsers";

const CHUNK_MIN_TOKEN_SIZE = 500;
const CHUNK_TARGET_TOKEN_SIZE = 820;
const CHUNK_MAX_TOKEN_SIZE = 900;
const CHUNK_TOKEN_OVERLAP = 120;

type DocumentForChunking = {
  id: string;
  company_id: string;
  folder_id: string;
  name: string;
  file_type: string;
  source_metadata_json: Record<string, unknown> | null;
  external_source_url: string | null;
  parsed_file_path: string;
};

function tokenize(text: string) {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

function isHeadingLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  return /^#{1,6}\s+/.test(trimmed)
    || /^\d+(?:\.\d+)*[.)]?\s+\S+/.test(trimmed)
    || /^[A-Z][A-Z0-9\s&:/-]{5,}$/.test(trimmed);
}

function normalizeHeading(line: string) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\d+(?:\.\d+)*[.)]?\s+/, "")
    .trim();
}

function buildSectionPath(previousPath: string[], heading: string) {
  const numeric = heading.match(/^(\d+(?:\.\d+)*)\s+/);

  if (!numeric) {
    return [...previousPath.slice(-2), heading].filter(Boolean);
  }

  const depth = numeric[1].split(".").length;
  const next = [...previousPath.slice(0, Math.max(0, depth - 1)), heading];
  return next;
}

type PageSection = {
  title: string;
  sectionPath: string;
  text: string;
};

function splitIntoSections(pageText: string, defaultTitle: string) {
  const lines = pageText.split(/\r?\n/);
  const sections: PageSection[] = [];
  let currentTitle = defaultTitle || "Section";
  let currentPath = currentTitle ? [currentTitle] : [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (!text) {
      return;
    }

    sections.push({
      title: currentTitle,
      sectionPath: currentPath.join(" > "),
      text
    });
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (isHeadingLine(line)) {
      flush();
      const normalizedHeading = normalizeHeading(line) || currentTitle;
      currentTitle = normalizedHeading;
      currentPath = buildSectionPath(currentPath, normalizedHeading);
      continue;
    }

    if (!line.trim()) {
      if (buffer.length > 0) {
        buffer.push("");
      }
      continue;
    }

    buffer.push(line);
  }

  flush();

  if (sections.length === 0) {
    return [{ title: defaultTitle || "Section", sectionPath: defaultTitle || "Section", text: pageText }];
  }

  return sections;
}

function chunkSectionTokens(tokens: string[]) {
  const chunks: string[][] = [];

  if (tokens.length <= CHUNK_MAX_TOKEN_SIZE) {
    return [tokens];
  }

  const step = CHUNK_TARGET_TOKEN_SIZE - CHUNK_TOKEN_OVERLAP;

  for (let start = 0; start < tokens.length; start += step) {
    const next = tokens.slice(start, start + CHUNK_TARGET_TOKEN_SIZE);
    if (next.length === 0) {
      break;
    }

    chunks.push(next);

    if (start + CHUNK_TARGET_TOKEN_SIZE >= tokens.length) {
      break;
    }
  }

  return chunks;
}

function folderPathExpression() {
  return `
    WITH RECURSIVE folder_tree AS (
      SELECT id, parent_id, name, 0 AS depth
      FROM folders
      WHERE id = $1 AND deleted_at IS NULL
      UNION ALL
      SELECT parent.id, parent.parent_id, parent.name, folder_tree.depth + 1
      FROM folders parent
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
    const sections = splitIntoSections(page.text, parsed.title || "Section");

    for (const section of sections) {
      const tokens = tokenize(section.text);

      if (tokens.length === 0) {
        continue;
      }

      const tokenWindows = chunkSectionTokens(tokens);

      for (const chunkTokens of tokenWindows) {
        if (chunkTokens.length < CHUNK_MIN_TOKEN_SIZE && tokens.length > CHUNK_MIN_TOKEN_SIZE && chunkTokens !== tokenWindows[tokenWindows.length - 1]) {
          continue;
        }

        chunks.push({
          chunkIndex,
          content: chunkTokens.join(" "),
          pageNumber: page.page_number,
          sectionTitle: section.title || parsed.title || null,
          tokenCount: chunkTokens.length,
          metadata: {
            document_name: document.name,
            document_type: document.file_type,
            section_title: section.title,
            section_path: section.sectionPath,
            folder_path: folderPath,
            page_number: page.page_number,
            country: typeof document.source_metadata_json?.country === "string" ? document.source_metadata_json.country : undefined,
            department: typeof document.source_metadata_json?.department === "string" ? document.source_metadata_json.department : undefined,
            process_stage: typeof document.source_metadata_json?.process_stage === "string" ? document.source_metadata_json.process_stage : undefined,
            effective_date: typeof document.source_metadata_json?.effective_date === "string" ? document.source_metadata_json.effective_date : undefined,
            source_url: document.external_source_url || (typeof document.source_metadata_json?.source_url === "string" ? document.source_metadata_json.source_url : undefined),
            parsed_title: parsed.title,
            parsed_author: typeof parsed.metadata?.author === "string" ? parsed.metadata.author : undefined,
            parsed_created_at: typeof parsed.metadata?.created_at === "string" ? parsed.metadata.created_at : undefined,
            parse_page_count: parsed.metadata?.page_count
          }
        });
        chunkIndex += 1;
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
        documents.source_metadata_json,
        documents.external_source_url,
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

  if (chunks.length === 0) {
    console.error("[Indexing] Chunking produced zero chunks.", {
      documentId: document.id,
      name: document.name,
      parsedPages: parsed.pages.length
    });
    throw new Error("Chunking produced zero chunks. Check parser output quality and metadata filters.");
  }
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
