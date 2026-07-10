import pg from "pg";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import crypto from "node:crypto";
import "../db/load-env.mjs";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
const pollMs = Number(process.env.JOB_WORKER_POLL_MS || 2000);
const runOnce = process.argv.includes("--once");
const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_ROOT || "./storage");
const defaultEmbeddingConfig = {
  provider: process.env.EMBEDDING_PROVIDER || "local_bge",
  model: normalizeEmbeddingModel(process.env.EMBEDDING_PROVIDER || "local_bge", process.env.EMBEDDING_MODEL || "nomic-embed-text"),
  dimension: Number(process.env.EMBEDDING_DIMENSIONS || 768),
  endpoint: process.env.EMBEDDING_ENDPOINT || "http://localhost:11434/api/embed",
  apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || ""
};
const embeddingBatchSize = Number(process.env.EMBEDDING_BATCH_SIZE || 64);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const client = new Client({ connectionString: databaseUrl });

function normalizeStoragePath(storagePath) {
  const cleanPath = storagePath.replace(/\\/g, "/").replace(/^\/+/, "");

  if (!cleanPath || cleanPath.includes("..")) {
    throw new Error("Invalid storage path.");
  }

  return cleanPath;
}

function resolveStoragePath(storagePath) {
  const resolved = path.resolve(storageRoot, normalizeStoragePath(storagePath));

  if (!resolved.startsWith(storageRoot + path.sep) && resolved !== storageRoot) {
    throw new Error("Storage path escapes the configured storage root.");
  }

  return resolved;
}

async function getStoredFile(storagePath) {
  return readFile(resolveStoragePath(storagePath));
}

async function saveStoredFile(storagePath, buffer) {
  const target = resolveStoragePath(storagePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
}

async function deleteStoredFile(storagePath) {
  const { rm } = await import("node:fs/promises");
  await rm(resolveStoragePath(storagePath), { force: true });
}

async function fetchExternalFile(document) {
  const sourceUrl = document.external_source_url || document.external_source_reference;

  if (!sourceUrl) {
    throw new Error("External source URL is required for external reference documents.");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new Error("Only HTTP and HTTPS external source URLs are supported right now.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS external source URLs are supported right now.");
  }

  const response = await fetch(parsedUrl, {
    headers: {
      Accept: "application/octet-stream,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to read external source. HTTP ${response.status}.`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function claimNextJob() {
  await client.query("BEGIN");

  try {
    const result = await client.query(
      `
        WITH next_job AS (
          SELECT id
          FROM processing_jobs
          WHERE status IN ('pending', 'retrying')
            AND attempts < max_attempts
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE processing_jobs
        SET
          status = 'running',
          attempts = attempts + 1,
          started_at = now(),
          error_message = NULL,
          updated_at = now()
        WHERE id IN (SELECT id FROM next_job)
        RETURNING *
      `
    );

    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function markCompleted(jobId) {
  await client.query(
    `
      UPDATE processing_jobs
      SET
        status = 'completed',
        completed_at = now(),
        error_message = NULL,
        updated_at = now()
      WHERE id = $1
    `,
    [jobId]
  );
}

async function markFailed(job, error) {
  const message = error instanceof Error ? error.message : "Job failed.";
  const canRetry = job.attempts < job.max_attempts;

  if (job.job_type === "parse_document" || job.job_type === "chunk_document" || job.job_type === "embed_document") {
    await client.query(
      "UPDATE documents SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1",
      [job.document_id, message]
    );
  }

  await client.query(
    `
      UPDATE processing_jobs
      SET
        status = $2::processing_job_status,
        error_message = $3,
        completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE completed_at END,
        updated_at = now()
      WHERE id = $1
    `,
    [job.id, canRetry ? "retrying" : "failed", message]
  );
}

function buildOutput(title, pages, metadata = {}) {
  return {
    title,
    pages,
    metadata: {
      ...metadata,
      page_count: pages.length
    }
  };
}

function splitTextIntoPages(text) {
  const byFormFeed = text.split(/\f/g).map((page) => page.trim()).filter(Boolean);

  if (byFormFeed.length > 0) {
    return byFormFeed;
  }

  const trimmed = text.trim();
  return trimmed ? [trimmed] : [""];
}

function parsedOutputPath(companyId, documentId) {
  return `/companies/${companyId}/documents/${documentId}/parsed/extracted.json`;
}

function tokenize(text) {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

async function getFolderPath(folderId) {
  const result = await client.query(
    `
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
    `,
    [folderId]
  );

  return result.rows[0]?.folder_path ?? "";
}

function createDocumentChunks(document, folderPath, parsedOutput) {
  const chunkTokenSize = 850;
  const chunkTokenOverlap = 125;
  const step = chunkTokenSize - chunkTokenOverlap;
  const chunks = [];
  let chunkIndex = 0;

  for (const page of parsedOutput.pages ?? []) {
    const pageNumber = Number(page.page_number) || 1;
    const tokens = tokenize(String(page.text ?? ""));

    if (tokens.length === 0) {
      continue;
    }

    for (let start = 0; start < tokens.length; start += step) {
      const chunkTokens = tokens.slice(start, start + chunkTokenSize);

      if (chunkTokens.length === 0) {
        break;
      }

      chunks.push({
        chunkIndex,
        content: chunkTokens.join(" "),
        pageNumber,
        sectionTitle: parsedOutput.title || null,
        tokenCount: chunkTokens.length,
        metadata: {
          document_name: document.name,
          folder_path: folderPath,
          file_type: document.file_type,
          page_number: pageNumber
        }
      });
      chunkIndex += 1;

      if (start + chunkTokenSize >= tokens.length) {
        break;
      }
    }
  }

  return chunks;
}

function normalizeVector(vector) {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / length).toFixed(8)));
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

function normalizeGeminiEmbeddingModel(model) {
  return normalizeEmbeddingModel("gemini", model);
}

function normalizeEmbeddingModel(provider, model) {
  const cleanModel = (model || "").replace(/^models\//, "");

  if (provider === "gemini" && (!cleanModel || cleanModel === "text-embedding-004")) {
    return "gemini-embedding-001";
  }

  return cleanModel;
}

async function embedLocalMockText(text) {
  const config = await getEmbeddingConfig();
  const vector = new Array(config.dimension).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  for (const token of tokens) {
    const hash = crypto.createHash("sha256").update(token).digest();
    const index = hash.readUInt32BE(0) % config.dimension;
    const sign = hash[4] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  return normalizeVector(vector);
}

async function getEmbeddingConfig() {
  try {
    const result = await client.query(
      `
        SELECT
          provider,
          model,
          dimension,
          endpoint,
          api_key
        FROM ai_embedding_provider_configs
        WHERE is_active = true
          AND deleted_at IS NULL
        ORDER BY is_primary DESC, updated_at DESC
        LIMIT 1
      `
    );
    const row = result.rows[0];

    if (row) {
      return {
        provider: row.provider,
        model: normalizeEmbeddingModel(row.provider, row.model),
        dimension: Number(row.dimension),
        endpoint: row.endpoint || defaultEmbeddingConfig.endpoint,
        apiKey: row.api_key || defaultEmbeddingConfig.apiKey
      };
    }
  } catch {
    // Migrations may not have run yet. Fall back to environment config.
  }

  return defaultEmbeddingConfig;
}

async function embedLocalBGEBatch(texts, config) {
  try {
    return await requestLocalEmbeddings(config.model, texts, config);
  } catch {
    try {
      return await requestLocalEmbeddings("nomic-embed-text", texts, config);
    } catch {
      return Promise.all(texts.map((text) => embedLocalMockText(text)));
    }
  }
}

async function requestLocalEmbeddings(model, texts, config) {
  const timeout = timeoutSignal(15000);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
      signal: timeout.signal
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(typeof payload?.error === "string" ? payload.error : "Local BGE embedding request failed.");
    }

    if (Array.isArray(payload?.embeddings)) {
      return payload.embeddings;
    }

    if (Array.isArray(payload?.data)) {
      return payload.data.map((item) => item.embedding);
    }

    throw new Error("Local BGE embedding response did not include embeddings.");
  } finally {
    timeout.clear();
  }
}

async function embedOpenAIBatch(texts, config) {
  const apiKey = config.apiKey;

  if (!apiKey) {
    throw new Error("EMBEDDING_API_KEY or OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai.");
  }

  const body = {
    model: config.model,
    input: texts
  };

  if (config.dimension) {
    body.dimensions = config.dimension;
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "OpenAI embedding request failed.");
  }

  return [...payload.data]
    .sort((first, second) => first.index - second.index)
    .map((item) => item.embedding);
}

async function embedGeminiBatch(texts, config) {
  if (!config.apiKey) {
    throw new Error("EMBEDDING_API_KEY or GEMINI_API_KEY is required when EMBEDDING_PROVIDER=gemini.");
  }

  const model = normalizeGeminiEmbeddingModel(config.model);
  const modelResource = `models/${model}`;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents?key=${config.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: modelResource,
          content: { parts: [{ text }] },
          ...(config.dimension ? { outputDimensionality: config.dimension } : {})
        }))
      })
    }
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Gemini embedding request failed.");
  }

  return payload.embeddings.map((item) => item.values);
}

async function embedCustomBatch(texts, config) {
  if (!config.endpoint) {
    throw new Error("EMBEDDING_ENDPOINT is required when EMBEDDING_PROVIDER=custom.");
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: config.model, input: texts })
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Custom embedding request failed.");
  }

  return payload.embeddings ?? payload.data?.map((item) => item.embedding);
}

async function embedBatch(texts) {
  const config = await getEmbeddingConfig();

  if (config.provider === "local_bge") {
    return embedLocalBGEBatch(texts, config);
  }

  if (config.provider === "openai") {
    return embedOpenAIBatch(texts, config);
  }

  if (config.provider === "gemini") {
    return embedGeminiBatch(texts, config);
  }

  if (config.provider === "custom") {
    return embedCustomBatch(texts, config);
  }

  throw new Error(`Unsupported embedding provider: ${config.provider}`);
}

async function getEmbeddingColumnMode() {
  const result = await client.query(
    `
      SELECT udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'chunk_embeddings'
        AND column_name = 'embedding'
    `
  );

  return result.rows[0]?.udt_name === "vector" ? "vector" : "jsonb";
}

function serializeEmbedding(embedding, mode) {
  return mode === "vector" ? `[${embedding.join(",")}]` : JSON.stringify(embedding);
}

async function parseTxt(file) {
  return buildOutput("", [{ page_number: 1, text: file.toString("utf8") }]);
}

async function parsePdf(file) {
  const parser = new PDFParse({ data: file });

  try {
    const [textResult, infoResult] = await Promise.all([
      parser.getText(),
      parser.getInfo().catch(() => null)
    ]);
    const info = infoResult?.info ?? {};
    const pages = splitTextIntoPages(textResult.text).map((text, index) => ({ page_number: index + 1, text }));

    return buildOutput(
      typeof info.Title === "string" ? info.Title : "",
      pages,
      {
        author: typeof info.Author === "string" ? info.Author : "",
        created_at: typeof info.CreationDate === "string" ? info.CreationDate : "",
        pdf_info: info
      }
    );
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(file) {
  const parsed = await mammoth.extractRawText({ buffer: file });
  const pages = splitTextIntoPages(parsed.value).map((text, index) => ({ page_number: index + 1, text }));

  return buildOutput("", pages, {
    warnings: parsed.messages.map((message) => message.message)
  });
}

async function parseByFileType(fileType, file) {
  switch (fileType) {
    case "txt":
      return parseTxt(file);
    case "pdf":
      return parsePdf(file);
    case "docx":
      return parseDocx(file);
    case "csv":
    case "xlsx":
    case "pptx":
      throw new Error("Parser is not implemented for this file type yet.");
    default:
      throw new Error(`No parser found for file type: ${fileType}`);
  }
}

async function parseDocument(job) {
  const documentResult = await client.query(
    `
      SELECT
        id,
        company_id,
        file_type,
        storage_path,
        storage_mode,
        external_source_url,
        external_source_reference,
        source_metadata_json
      FROM documents
      WHERE id = $1 AND status <> 'deleted'
    `,
    [job.document_id]
  );
  const document = documentResult.rows[0];

  if (!document) {
    throw new Error("Document was not found.");
  }

  if (document.storage_mode === "managed_upload" && !document.storage_path) {
    throw new Error("Document has no stored file path.");
  }

  await client.query(
    "UPDATE documents SET status = 'processing', error_message = NULL, updated_at = now() WHERE id = $1",
    [document.id]
  );

  const originalFile = document.storage_mode === "managed_upload"
    ? await getStoredFile(document.storage_path)
    : await fetchExternalFile(document);
  const parsedOutput = await parseByFileType(document.file_type, originalFile);
  const parsedPath = parsedOutputPath(document.company_id, document.id);
  await saveStoredFile(parsedPath, Buffer.from(JSON.stringify(parsedOutput, null, 2), "utf8"));
  const retentionMode = document.storage_mode === "strict_external_reference" ? "temporary" : "stored";

  await client.query("BEGIN");

  try {
    await client.query(
      `
        INSERT INTO document_parsed_contents (
          company_id,
          document_id,
          parsed_file_path,
          page_count,
          metadata_json,
          retention_mode
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        ON CONFLICT (document_id)
        DO UPDATE SET
          parsed_file_path = EXCLUDED.parsed_file_path,
          page_count = EXCLUDED.page_count,
          metadata_json = EXCLUDED.metadata_json,
          retention_mode = EXCLUDED.retention_mode,
          updated_at = now()
      `,
      [
        document.company_id,
        document.id,
        parsedPath,
        parsedOutput.pages.length,
        JSON.stringify({
          ...(parsedOutput.metadata ?? {}),
          storage_mode: document.storage_mode,
          external_source_reference: document.external_source_reference ?? document.external_source_url ?? null
        }),
        retentionMode
      ]
    );

    await client.query("DELETE FROM document_pages WHERE document_id = $1", [document.id]);

    if (parsedOutput.pages.length > 0) {
      await client.query(
        `
          INSERT INTO document_pages (company_id, document_id, page_number, character_count)
          SELECT $1, $2, page_number, character_count
          FROM unnest($3::integer[], $4::integer[]) AS page_stats(page_number, character_count)
        `,
        [
          document.company_id,
          document.id,
          parsedOutput.pages.map((page) => page.page_number),
          parsedOutput.pages.map((page) => page.text.length)
        ]
      );
    }

    await client.query(
      "UPDATE documents SET status = 'parsed', error_message = NULL, updated_at = now() WHERE id = $1",
      [document.id]
    );

    await client.query(
      `
        INSERT INTO processing_jobs (company_id, document_id, job_type, max_attempts)
        VALUES ($1, $2, 'chunk_document', 3)
        ON CONFLICT (document_id, job_type) WHERE status IN ('pending', 'running', 'retrying')
        DO UPDATE SET updated_at = now()
      `,
      [document.company_id, document.id]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function chunkDocument(job) {
  const documentResult = await client.query(
    `
      SELECT
        documents.id,
        documents.company_id,
        documents.folder_id,
        documents.name,
        documents.file_type,
        documents.storage_mode,
        document_parsed_contents.parsed_file_path,
        document_parsed_contents.retention_mode
      FROM documents
      INNER JOIN document_parsed_contents ON document_parsed_contents.document_id = documents.id
      WHERE documents.id = $1
        AND documents.status <> 'deleted'
    `,
    [job.document_id]
  );
  const document = documentResult.rows[0];

  if (!document) {
    throw new Error("Parsed document was not found.");
  }

  await client.query(
    "UPDATE documents SET status = 'processing', error_message = NULL, updated_at = now() WHERE id = $1",
    [document.id]
  );

  const parsedFile = await getStoredFile(document.parsed_file_path);
  const parsedOutput = JSON.parse(parsedFile.toString("utf8"));
  const folderPath = await getFolderPath(document.folder_id);
  const chunks = createDocumentChunks(document, folderPath, parsedOutput);

  await client.query("BEGIN");

  try {
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

    if (document.storage_mode === "strict_external_reference" || document.retention_mode === "temporary") {
      await deleteStoredFile(document.parsed_file_path).catch(() => null);
      await client.query(
        "DELETE FROM document_parsed_contents WHERE document_id = $1",
        [document.id]
      );
    }

    await client.query(
      `
        INSERT INTO processing_jobs (company_id, document_id, job_type, max_attempts)
        VALUES ($1, $2, 'embed_document', 3)
        ON CONFLICT (document_id, job_type) WHERE status IN ('pending', 'running', 'retrying')
        DO UPDATE SET updated_at = now()
      `,
      [document.company_id, document.id]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function embedDocument(job) {
  const chunksResult = await client.query(
    `
      SELECT id, company_id, document_id, content
      FROM document_chunks
      WHERE document_id = $1
      ORDER BY chunk_index ASC
    `,
    [job.document_id]
  );
  const chunks = chunksResult.rows;

  if (chunks.length === 0) {
    throw new Error("No chunks found for document.");
  }

  await client.query(
    "UPDATE documents SET status = 'processing', error_message = NULL, updated_at = now() WHERE id = $1",
    [job.document_id]
  );

  const embeddingMode = await getEmbeddingColumnMode();
  const embeddingConfig = await getEmbeddingConfig();

  await client.query("BEGIN");

  try {
    await client.query("DELETE FROM chunk_embeddings WHERE document_id = $1", [job.document_id]);

    for (let start = 0; start < chunks.length; start += embeddingBatchSize) {
      const batch = chunks.slice(start, start + embeddingBatchSize);
      const embeddings = await embedBatch(batch.map((chunk) => chunk.content));

      await client.query(
        `
          INSERT INTO chunk_embeddings (
            company_id,
            document_id,
            chunk_id,
            embedding,
            embedding_provider,
            embedding_model,
            embedding_dimension
          )
          SELECT
            company_id,
            document_id,
            chunk_id,
            embedding::${embeddingMode === "vector" ? "vector" : "jsonb"},
            $5,
            $6,
            $7
          FROM unnest(
            $1::uuid[],
            $2::uuid[],
            $3::uuid[],
            $4::text[]
          ) AS embedding_rows(company_id, document_id, chunk_id, embedding)
        `,
        [
          batch.map((chunk) => chunk.company_id),
          batch.map((chunk) => chunk.document_id),
          batch.map((chunk) => chunk.id),
          embeddings.map((embedding) => serializeEmbedding(embedding, embeddingMode)),
          embeddingConfig.provider,
          embeddingConfig.model,
          embeddingConfig.dimension
        ]
      );
    }

    await client.query(
      "UPDATE documents SET status = 'embedded', error_message = NULL, updated_at = now() WHERE id = $1",
      [job.document_id]
    );

    await client.query(
      `
        INSERT INTO processing_jobs (company_id, document_id, job_type, max_attempts)
        VALUES ($1, $2, 'index_document', 3)
        ON CONFLICT (document_id, job_type) WHERE status IN ('pending', 'running', 'retrying')
        DO UPDATE SET updated_at = now()
      `,
      [chunks[0].company_id, job.document_id]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function indexDocument(_job) {
  // Placeholder for future indexing integration.
}

async function executeJob(job) {
  switch (job.job_type) {
    case "parse_document":
      await parseDocument(job);
      break;
    case "chunk_document":
      await chunkDocument(job);
      break;
    case "embed_document":
      await embedDocument(job);
      break;
    case "index_document":
      await indexDocument(job);
      break;
    default:
      throw new Error(`Unsupported job type: ${job.job_type}`);
  }
}

async function processOneJob() {
  const job = await claimNextJob();

  if (!job) {
    return false;
  }

  try {
    await executeJob(job);
    await markCompleted(job.id);
    console.log(`Completed ${job.job_type} job ${job.id}.`);
  } catch (error) {
    await markFailed(job, error);
    console.error(`Failed ${job.job_type} job ${job.id}:`, error);
  }

  return true;
}

await client.connect();
console.log(`Processing worker started. Poll interval: ${pollMs}ms.`);

try {
  do {
    const processed = await processOneJob();

    if (runOnce) {
      break;
    }

    if (!processed) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } while (true);
} finally {
  await client.end();
}
