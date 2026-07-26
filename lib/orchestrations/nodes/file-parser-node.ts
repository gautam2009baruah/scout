import type { FileParserNodeConfig } from "@/shared/orchestrationTypes";
import { resolveVariablePath, setVariablePath } from "../expression-evaluator";
import { getStorageProvider } from "@/lib/storage/provider";
import { getDocumentParser } from "@/lib/document-processing/parsers";

type AttachmentReference = {
  id?: string;
  name?: string;
  fileType?: string;
  storagePath?: string;
  sizeBytes?: number;
};

function isAttachmentReference(value: unknown): value is AttachmentReference {
  return Boolean(value && typeof value === "object" && "storagePath" in value);
}

// Minimal RFC4180-aware CSV row parser (quoted fields, escaped quotes, commas
// inside quotes). No dependency was added for this since the codebase has no
// existing CSV library and the format is small enough to implement directly.
function parseCsvRows(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const [header, ...dataRows] = rows;
  return dataRows.map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key.trim() || `column_${index + 1}`] = cells[index] ?? "";
    });
    return record;
  });
}

export async function executeFileParserNode(
  config: FileParserNodeConfig,
  context: Record<string, unknown>
): Promise<{ success: boolean; output?: Record<string, unknown>; error?: string }> {
  try {
    const sourcePath = String(config.sourceVariablePath || "").trim();
    const outputVariable = String(config.outputVariable || "parsedFile").trim();

    if (!sourcePath) throw new Error("File Parser source variable path is required");
    if (!outputVariable) throw new Error("File Parser output variable is required");

    const reference = resolveVariablePath(sourcePath, context);

    if (!isAttachmentReference(reference) || !reference.storagePath || !reference.fileType) {
      throw new Error(
        `No file attachment found at "${sourcePath}". A file must be attached to the triggering chat message.`
      );
    }

    const parser = getDocumentParser(reference.fileType);
    if (!parser) {
      throw new Error(`No parser is available for file type "${reference.fileType}".`);
    }

    const buffer = await getStorageProvider().get_file(reference.storagePath);
    const parsed = await parser.parse(buffer);
    const text = parsed.pages.map((page) => page.text).join("\n\n");

    const output: Record<string, unknown> = {};

    if (config.extractMode === "structured") {
      if (reference.fileType !== "csv") {
        throw new Error('Structured extraction is only supported for CSV files today; use "text" mode for other file types.');
      }

      const rows = parseCsvRows(text);
      setVariablePath(outputVariable, rows, output);
      setVariablePath(`${outputVariable}Meta`, {
        fileName: reference.name,
        fileType: reference.fileType,
        rowCount: rows.length,
      }, output);
    } else {
      setVariablePath(outputVariable, text, output);
      setVariablePath(`${outputVariable}Meta`, {
        fileName: reference.name,
        fileType: reference.fileType,
        pageCount: parsed.pages.length,
      }, output);
    }

    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to parse file"
    };
  }
}
