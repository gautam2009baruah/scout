import type { RetrievalChunk } from "./retrieval-engine";

export type Citation = {
  document_id: string;
  document_name: string;
  document_type?: string;
  folder_path: string;
  page_number: number;
  section_title: string;
  section_path?: string;
  chunk_id: string;
  preview: string;
  country?: string;
  department?: string;
  process_stage?: string;
  effective_date?: string;
  citation_type?: "text" | "visual";
  visual_asset_type?: string;
  source_url?: string;
  download_available?: boolean;
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
      const key = `${citationType}:${chunk.document_id}:${chunk.page_number}:${chunk.chunk_id}`;

      if (citations.has(key)) {
        continue;
      }

      citations.set(key, {
        document_id: chunk.document_id,
        document_name: chunk.document_name,
        document_type: chunk.document_type,
        folder_path: chunk.folder_path,
        page_number: chunk.page_number,
        section_title: chunk.section_title,
        section_path: chunk.section_path,
        chunk_id: chunk.chunk_id,
        preview: buildPreview(chunk.content),
        country: chunk.country,
        department: chunk.department,
        process_stage: chunk.process_stage,
        effective_date: chunk.effective_date,
        citation_type: citationType,
        visual_asset_type: chunk.visual_asset_type,
        source_url: chunk.source_url,
        download_available: chunk.download_available
      });
    }

    return Array.from(citations.values());
  }
}
