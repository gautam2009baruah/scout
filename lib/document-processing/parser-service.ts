import { getPool } from "@/lib/db/pool";
import { getStorageProvider } from "@/lib/storage/provider";
import { enqueueProcessingJob } from "@/lib/admin/processing-jobs";
import { getDocumentParser, type ParsedDocumentOutput } from "./parsers";
import { extractVisualInsights } from "./visual-intelligence";
import { assessParseQuality } from "./parse-quality";

type DocumentForParsing = {
  id: string;
  company_id: string;
  file_type: string;
  version: number;
  name: string;
  original_filename: string;
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
      SELECT id, company_id, file_type, version, name, original_filename, storage_path
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

  const quality = assessParseQuality(output);

  if (quality.isEmpty) {
    console.error("[Indexing] Empty parsed document detected.", {
      documentId: document.id,
      fileType: document.file_type,
      pageCount: output.pages.length,
      totalCharacters: quality.totalCharacters
    });
    throw new Error("Document parsing produced empty content.");
  }

  if (quality.isPoorQuality) {
    console.warn("[Indexing] Poor parse quality detected.", {
      documentId: document.id,
      fileType: document.file_type,
      pageCount: output.pages.length,
      sparsePages: quality.sparsePages,
      totalCharacters: quality.totalCharacters
    });
  }

  output.metadata = {
    ...output.metadata,
    parse_quality: {
      total_characters: quality.totalCharacters,
      sparse_pages: quality.sparsePages,
      sparse_ratio: Number(quality.sparseRatio.toFixed(4))
    }
  };

  const parsedPath = parsedOutputPath(document.company_id, document.id);
  const visualInsights = extractVisualInsights({
    fileType: document.file_type,
    documentName: document.name,
    originalFilename: document.original_filename,
    parsed: output
  });

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

    await client.query(
      `
        UPDATE document_versions
        SET
          parsed_file_path = $3,
          page_count = $4,
          content_text = $5
        WHERE document_id = $1
          AND version_number = $2
      `,
      [
        document.id,
        document.version,
        parsedPath,
        output.pages.length,
        output.pages.map((page) => page.text || "").join("\n\n")
      ]
    );

    await client.query(
      "DELETE FROM document_visual_insights WHERE document_id = $1 AND version_number = $2",
      [document.id, document.version]
    );
    await client.query(
      "DELETE FROM document_visual_assets WHERE document_id = $1 AND version_number = $2",
      [document.id, document.version]
    );

    if (visualInsights.length > 0) {
      for (const insight of visualInsights) {
        const assetResult = await client.query<{ id: string }>(
          `
            INSERT INTO document_visual_assets (
              company_id,
              document_id,
              version_number,
              page_number,
              asset_type,
              label,
              metadata_json
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            RETURNING id
          `,
          [
            document.company_id,
            document.id,
            document.version,
            insight.pageNumber,
            insight.assetType,
            insight.label,
            JSON.stringify(insight.metadata)
          ]
        );

        await client.query(
          `
            INSERT INTO document_visual_insights (
              company_id,
              document_id,
              version_number,
              asset_id,
              extracted_text,
              confidence,
              citation_preview,
              metadata_json
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          `,
          [
            document.company_id,
            document.id,
            document.version,
            assetResult.rows[0].id,
            insight.extractedText,
            insight.confidence,
            insight.citationPreview,
            JSON.stringify(insight.metadata)
          ]
        );
      }
    }
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
