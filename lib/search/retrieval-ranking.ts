import type { RetrievalChunk } from "./retrieval-engine";
import type { VectorSearchResult } from "./vector-search";

type CandidateSource = "vector" | "bm25" | "visual";

export type RankedCandidate = {
  result: VectorSearchResult | RetrievalChunk;
  sources: Set<CandidateSource>;
  ranks: Partial<Record<CandidateSource, number>>;
  rrfScore: number;
  rerankScore: number;
};

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(first: Set<string>, second: Set<string>) {
  if (first.size === 0 || second.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of first) {
    if (second.has(token)) {
      intersection += 1;
    }
  }

  return intersection / (first.size + second.size - intersection);
}

function contentKey(content: string) {
  return tokenize(content).slice(0, 80).join(" ");
}

function lexicalCoverage(query: string, content: string) {
  const queryTokens = new Set(tokenize(query));
  const contentTokens = new Set(tokenize(content));

  if (queryTokens.size === 0 || contentTokens.size === 0) {
    return 0;
  }

  let matched = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) {
      matched += 1;
    }
  }

  return matched / queryTokens.size;
}

function metadataBoost(query: string, candidate: VectorSearchResult | RetrievalChunk) {
  const corpus = [
    candidate.document_name,
    candidate.section_title,
    (candidate as VectorSearchResult).section_path,
    (candidate as VectorSearchResult).document_type,
    (candidate as VectorSearchResult).country,
    (candidate as VectorSearchResult).department,
    (candidate as VectorSearchResult).process_stage
  ].filter(Boolean).join(" ").toLowerCase();

  if (!corpus) {
    return 0;
  }

  const terms = tokenize(query);
  if (terms.length === 0) {
    return 0;
  }

  const matched = terms.filter((term) => corpus.includes(term)).length;
  return Math.min(0.12, matched * 0.02);
}

export function reciprocalRankFusion(input: {
  vectorResults: VectorSearchResult[];
  bm25Results: VectorSearchResult[];
  vectorWeight: number;
  bm25Weight: number;
  rrfK: number;
}): RankedCandidate[] {
  const merged = new Map<string, RankedCandidate>();

  function upsert(result: VectorSearchResult, source: CandidateSource, rank: number, weight: number) {
    const existing = merged.get(result.chunk_id);
    const bonus = weight / (input.rrfK + rank);

    if (existing) {
      existing.sources.add(source);
      existing.ranks[source] = rank;
      existing.rrfScore += bonus;
      return;
    }

    merged.set(result.chunk_id, {
      result,
      sources: new Set([source]),
      ranks: { [source]: rank },
      rrfScore: bonus,
      rerankScore: bonus
    });
  }

  input.vectorResults.forEach((item, index) => upsert(item, "vector", index + 1, input.vectorWeight));
  input.bm25Results.forEach((item, index) => upsert(item, "bm25", index + 1, input.bm25Weight));

  return Array.from(merged.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}

export function rerankCandidates(query: string, candidates: RankedCandidate[]) {
  return candidates
    .map((candidate) => {
      const content = (candidate.result as VectorSearchResult).content || (candidate.result as RetrievalChunk).content || "";
      const coverage = lexicalCoverage(query, content);
      const boost = metadataBoost(query, candidate.result);
      candidate.rerankScore = Number((candidate.rrfScore * 0.7 + coverage * 0.25 + boost).toFixed(6));
      return candidate;
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
}

export function selectDiverseChunks(chunks: RetrievalChunk[], minCount: number, maxCount: number): RetrievalChunk[] {
  const selected: RetrievalChunk[] = [];
  const seenKeys = new Set<string>();

  for (const chunk of chunks) {
    if (selected.length >= maxCount) {
      break;
    }

    const key = contentKey(chunk.content);
    if (!key) {
      continue;
    }

    if (seenKeys.has(key)) {
      continue;
    }

    const incoming = new Set(tokenize(chunk.content));
    const nearDuplicate = selected.some((existing) => {
      const existingTokens = new Set(tokenize(existing.content));
      return jaccard(incoming, existingTokens) >= 0.88;
    });

    if (nearDuplicate) {
      continue;
    }

    const duplicateDocPage = selected.some((existing) =>
      existing.document_id === chunk.document_id
      && existing.page_number === chunk.page_number
      && existing.section_title === chunk.section_title
    );

    if (duplicateDocPage && selected.length >= minCount) {
      continue;
    }

    seenKeys.add(key);
    selected.push(chunk);
  }

  return selected.slice(0, maxCount);
}
