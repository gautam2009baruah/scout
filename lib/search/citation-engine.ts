import type { RetrievalChunk } from "./retrieval-engine";

export type Citation = {
  document_id: string;
  document_name: string;
  folder_path: string;
  page_number: number;
  section_title: string;
  chunk_id: string;
  preview: string;
  citation_type?: "text" | "visual";
  visual_asset_type?: string;
};

function buildPreview(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();

  if (compact.length <= 220) {
    return compact;
  }

  return `${compact.slice(0, 217).trim()}...`;
}

export class CitationEngine {
  static build_citations(chunks: RetrievalChunk[]): Citation[] {
    const citations = new Map<string, Citation>();

    for (const chunk of chunks) {
      const citationType = chunk.citation_type ?? "text";
      const key = citationType === "visual"
        ? `${chunk.document_id}:${chunk.page_number}:${chunk.chunk_id}`
        : `${chunk.document_id}:${chunk.page_number}`;

      if (citations.has(key)) {
        continue;
      }

      citations.set(key, {
        document_id: chunk.document_id,
        document_name: chunk.document_name,
        folder_path: chunk.folder_path,
        page_number: chunk.page_number,
        section_title: chunk.section_title,
        chunk_id: chunk.chunk_id,
        preview: buildPreview(chunk.content),
        citation_type: citationType,
        visual_asset_type: chunk.visual_asset_type
      });
    }

    return Array.from(citations.values());
  }
}
