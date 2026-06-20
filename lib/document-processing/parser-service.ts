import { getPool } from "@/lib/db/pool";
import { getStorageProvider } from "@/lib/storage/provider";
import { enqueueProcessingJob } from "@/lib/admin/processing-jobs";
import { getDocumentParser, type ParsedDocumentOutput } from "./parsers";

type DocumentForParsing = {
  id: string;
  company_id: string;
  file_type: string;
  name: string;
  storage_path: string | null;
};

type ReadyDocumentForParsing = DocumentForParsing & {
  storage_path: string;
};

function parsedOutputPath(companyId: string, documentId: string) {
  return `/companies/${companyId}/documents/${documentId}/parsed/extracted.json`;
}

function serializeParsedOutput(output: ParsedDocumentOutput) {
  return Buffer.from(JSON.stringify(output, null, 2), "utf8");
}

async function loadDocument(documentId: string) {
  const result = await getPool().query<DocumentForParsing>(
    `
      SELECT id, company_id, file_type, name, storage_path
      FROM documents
      WHERE id = $1 AND status <> 'deleted'
    `,
    [documentId]
  );

  const document = result.rows[0];

  if (!document) {
    throw new Error("Document was not found.");
  }

  if (!document.storage_path) {
    throw new Error("Document has no stored file path.");
  }
  return document as ReadyDocumentForParsing;
}

export async function parseDocumentById(documentId: string) {
  const document = await loadDocument(documentId);
  const parser = getDocumentParser(document.file_type);

  if (!parser) {
    throw new Error(`No parser found for file type: ${document.file_type}`);
  }

  const storage = getStorageProvider();
  const originalFile = await storage.get_file(document.storage_path);
  const output = await parser.parse(originalFile);
  const parsedPath = parsedOutputPath(document.company_id, document.id);

  await storage.save_file(serializeParsedOutput(output), parsedPath);

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO document_parsed_contents (
          company_id,
          document_id,
          parsed_file_path,
          page_count,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (document_id)
        DO UPDATE SET
          parsed_file_path = EXCLUDED.parsed_file_path,
          page_count = EXCLUDED.page_count,
          metadata_json = EXCLUDED.metadata_json,
          updated_at = now()
      `,
      [
        document.company_id,
        document.id,
        parsedPath,
        output.pages.length,
        JSON.stringify(output.metadata ?? {})
      ]
    );

    await client.query("DELETE FROM document_pages WHERE document_id = $1", [document.id]);

    if (output.pages.length > 0) {
      await client.query(
        `
          INSERT INTO document_pages (company_id, document_id, page_number, character_count)
          SELECT $1, $2, page_number, character_count
          FROM unnest($3::integer[], $4::integer[]) AS page_stats(page_number, character_count)
        `,
        [
          document.company_id,
          document.id,
          output.pages.map((page) => page.page_number),
          output.pages.map((page) => page.text.length)
        ]
      );
    }

    await client.query(
      "UPDATE documents SET status = 'parsed', error_message = NULL, updated_at = now() WHERE id = $1",
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
    jobType: "chunk_document",
    maxAttempts: 3
  });

  return {
    parsedFilePath: parsedPath,
    pageCount: output.pages.length
  };
}

export async function markDocumentParsingFailed(documentId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Document parsing failed.";
  await getPool().query(
    "UPDATE documents SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1",
    [documentId, message]
  );
}
