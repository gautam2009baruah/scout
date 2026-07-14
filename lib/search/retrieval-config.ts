export type RetrievalConfig = {
  vector_top_k: number;
  bm25_top_k: number;
  reranker_top_k: number;
  vector_weight: number;
  bm25_weight: number;
  rrf_k: number;
  min_final_chunks: number;
  max_final_chunks: number;
};

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getRetrievalConfig(): RetrievalConfig {
  const rerankerTopK = Math.min(8, Math.max(5, Math.trunc(toNumber(process.env.RAG_RERANKER_TOP_K, 8))));

  return {
    vector_top_k: Math.min(50, Math.max(20, Math.trunc(toNumber(process.env.RAG_VECTOR_TOP_K, 20)))),
    bm25_top_k: Math.min(50, Math.max(20, Math.trunc(toNumber(process.env.RAG_BM25_TOP_K, 20)))),
    reranker_top_k: rerankerTopK,
    vector_weight: Math.max(0, Math.min(1, toNumber(process.env.RAG_VECTOR_WEIGHT, 0.55))),
    bm25_weight: Math.max(0, Math.min(1, toNumber(process.env.RAG_BM25_WEIGHT, 0.45))),
    rrf_k: Math.max(10, Math.trunc(toNumber(process.env.RAG_RRF_K, 60))),
    min_final_chunks: Math.min(rerankerTopK, Math.max(5, Math.trunc(toNumber(process.env.RAG_MIN_FINAL_CHUNKS, 5)))),
    max_final_chunks: rerankerTopK
  };
}
