import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export type ParsedDocumentPage = {
  page_number: number;
  text: string;
};

export type ParsedDocumentOutput = {
  title: string;
  pages: ParsedDocumentPage[];
  metadata: {
    author?: string;
    created_at?: string;
    page_count: number;
    [key: string]: unknown;
  };
};

export interface DocumentParser {
  can_parse(file_type: string): boolean;
  parse(file: Buffer): Promise<ParsedDocumentOutput>;
}

function buildOutput(title: string, pages: ParsedDocumentPage[], metadata: Record<string, unknown> = {}): ParsedDocumentOutput {
  return {
    title,
    pages,
    metadata: {
      ...metadata,
      page_count: pages.length
    }
  };
}

function splitTextIntoPages(text: string) {
  const byFormFeed = text.split(/\f/g).map((page) => page.trim()).filter(Boolean);

  if (byFormFeed.length > 0) {
    return byFormFeed;
  }

  const trimmed = text.trim();
  return trimmed ? [trimmed] : [""];
}

class TxtDocumentParser implements DocumentParser {
  can_parse(fileType: string) {
    return ["txt", "md", "csv"].includes(fileType);
  }

  async parse(file: Buffer) {
    const text = file.toString("utf8");
    return buildOutput("", [{ page_number: 1, text }]);
  }
}

class StructuredTextDocumentParser implements DocumentParser {
  can_parse(fileType: string) { return ["json", "xml", "html"].includes(fileType); }

  async parse(file: Buffer) {
    const raw = file.toString("utf8");
    let text = raw;
    if (raw.trimStart().startsWith("{") || raw.trimStart().startsWith("[")) {
      try { text = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* retain source for useful diagnostics */ }
    } else {
      text = raw
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+\n/g, "\n")
        .trim();
    }
    return buildOutput("", [{ page_number: 1, text }], { structured: true });
  }
}

class PdfDocumentParser implements DocumentParser {
  can_parse(fileType: string) {
    return fileType === "pdf";
  }

  async parse(file: Buffer) {
    const parser = new PDFParse({ data: file });

    try {
      const [textResult, infoResult] = await Promise.all([
        parser.getText(),
        parser.getInfo().catch(() => null)
      ]);
      const pageTexts = splitTextIntoPages(textResult.text);
      const pages = pageTexts.map((text, index) => ({ page_number: index + 1, text }));
      const info = infoResult?.info ?? {};

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
}

class DocxDocumentParser implements DocumentParser {
  can_parse(fileType: string) {
    return fileType === "docx";
  }

  async parse(file: Buffer) {
    const result = await mammoth.extractRawText({ buffer: file });
    const text = result.value.trim();
    const pages = splitTextIntoPages(text).map((pageText, index) => ({ page_number: index + 1, text: pageText }));

    return buildOutput("", pages, {
      warnings: result.messages.map((message) => message.message)
    });
  }
}

class PlaceholderDocumentParser implements DocumentParser {
  constructor(private fileTypes: string[]) {}

  can_parse(fileType: string) {
    return this.fileTypes.includes(fileType);
  }

  async parse(): Promise<ParsedDocumentOutput> {
    throw new Error("Parser is not implemented for this file type yet.");
  }
}

class ImageDocumentParser implements DocumentParser {
  can_parse(fileType: string) {
    return ["png", "jpg", "jpeg", "webp", "tiff"].includes(fileType);
  }

  async parse() {
    return buildOutput(
      "Visual document",
      [{
        page_number: 1,
        text: "Visual content file detected. OCR text extraction is not enabled for this deployment, but visual evidence metadata will be indexed for search."
      }],
      { visual_only: true }
    );
  }
}

const parsers: DocumentParser[] = [
  new TxtDocumentParser(),
  new PdfDocumentParser(),
  new DocxDocumentParser(),
  new StructuredTextDocumentParser(),
  new ImageDocumentParser(),
  new PlaceholderDocumentParser(["xlsx", "pptx", "epub", "zip"])
];

export function getDocumentParser(fileType: string) {
  const normalized = fileType.toLowerCase();
  return parsers.find((parser) => parser.can_parse(normalized)) ?? null;
}
