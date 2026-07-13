import type { ParsedDocumentOutput } from "./parsers";

type VisualAssetType =
  | "table"
  | "chart"
  | "flow_diagram"
  | "architecture_diagram"
  | "screenshot"
  | "organization_chart";

export type VisualInsightRecord = {
  pageNumber: number;
  assetType: VisualAssetType;
  label: string;
  extractedText: string;
  confidence: number;
  citationPreview: string;
  metadata: Record<string, unknown>;
};

type ExtractVisualInsightsInput = {
  fileType: string;
  documentName: string;
  originalFilename: string;
  parsed: ParsedDocumentOutput;
};

const DETECTORS: Array<{
  assetType: VisualAssetType;
  label: string;
  pattern: RegExp;
}> = [
  { assetType: "table", label: "Table", pattern: /\btable\b|\btabular\b/i },
  { assetType: "chart", label: "Chart", pattern: /\bchart\b|\bgraph\b|\bplot\b/i },
  { assetType: "flow_diagram", label: "Flow Diagram", pattern: /\bflow\s*diagram\b|\bflowchart\b/i },
  { assetType: "architecture_diagram", label: "Architecture Diagram", pattern: /\barchitecture\b|\bsystem\s+diagram\b/i },
  { assetType: "screenshot", label: "Screenshot", pattern: /\bscreenshot\b|\bscreen\s*capture\b|\bui\s+screen\b/i },
  { assetType: "organization_chart", label: "Organization Chart", pattern: /\borganization\s+chart\b|\borg\s+chart\b|\breporting\s+structure\b/i }
];

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function preview(value: string) {
  const normalized = compact(value);
  if (normalized.length <= 220) {
    return normalized;
  }

  return `${normalized.slice(0, 217)}...`;
}

function imageFallbackType(filename: string): VisualAssetType {
  const normalized = filename.toLowerCase();
  if (/(org|organization)/i.test(normalized)) return "organization_chart";
  if (/flow|workflow/i.test(normalized)) return "flow_diagram";
  if (/arch|architecture|system/i.test(normalized)) return "architecture_diagram";
  if (/chart|graph|plot/i.test(normalized)) return "chart";
  if (/table|sheet|grid/i.test(normalized)) return "table";
  return "screenshot";
}

export function extractVisualInsights(input: ExtractVisualInsightsInput): VisualInsightRecord[] {
  const fileType = input.fileType.toLowerCase();
  const records: VisualInsightRecord[] = [];

  for (const page of input.parsed.pages) {
    const lines = page.text
      .split(/\r?\n/)
      .map((line) => compact(line))
      .filter(Boolean);

    for (const line of lines) {
      for (const detector of DETECTORS) {
        if (!detector.pattern.test(line)) {
          continue;
        }

        records.push({
          pageNumber: page.page_number,
          assetType: detector.assetType,
          label: detector.label,
          extractedText: line,
          confidence: 0.72,
          citationPreview: preview(line),
          metadata: {
            detector: "keyword",
            source_line: line
          }
        });
      }
    }
  }

  const isImage = ["png", "jpg", "jpeg", "webp", "tiff"].includes(fileType);
  const isSpreadsheet = ["csv", "xlsx"].includes(fileType);

  if (isSpreadsheet && records.every((record) => record.assetType !== "table")) {
    const text = `Detected tabular content from ${input.originalFilename}.`;
    records.push({
      pageNumber: 1,
      assetType: "table",
      label: "Table",
      extractedText: text,
      confidence: 0.67,
      citationPreview: text,
      metadata: { detector: "file_type" }
    });
  }

  if (isImage && records.length === 0) {
    const assetType = imageFallbackType(input.originalFilename || input.documentName);
    const text = `Detected ${assetType.replaceAll("_", " ")} content in image ${input.originalFilename}.`;
    records.push({
      pageNumber: 1,
      assetType,
      label: assetType.replaceAll("_", " "),
      extractedText: text,
      confidence: 0.6,
      citationPreview: text,
      metadata: { detector: "image_fallback" }
    });
  }

  const unique = new Map<string, VisualInsightRecord>();
  for (const record of records) {
    const key = `${record.pageNumber}:${record.assetType}:${record.extractedText.toLowerCase()}`;
    if (!unique.has(key)) {
      unique.set(key, record);
    }
  }

  return Array.from(unique.values()).slice(0, 300);
}
