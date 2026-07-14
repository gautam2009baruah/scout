import assert from "node:assert/strict";
import test from "node:test";

import { assessParseQuality } from "@/lib/document-processing/parse-quality";
import { CitationEngine } from "@/lib/search/citation-engine";
import { detectFilterExclusionRisk } from "@/lib/search/filter-diagnostics";
import { isAnswerGrounded, shouldRequireCitations } from "@/lib/search/grounding";
import { normalizeAndExpandProcurementQuery } from "@/lib/search/query-normalization";
import { buildRetrievalFallbackPlan } from "@/lib/search/retrieval-fallback";
import { selectDiverseChunks } from "@/lib/search/retrieval-ranking";
import type { RetrievalChunk } from "@/lib/search/retrieval-engine";

test("synonym-based query expansion includes procurement aliases", () => {
  const expanded = normalizeAndExpandProcurementQuery("vendor policy for RFP and invoice workflow");

  assert.match(expanded.expanded, /supplier/);
  assert.match(expanded.expanded, /request for proposal/);
  assert.match(expanded.expanded, /accounts payable/);
});

test("fallback plan includes synonym retry, keyword-only retry, metadata relaxation, and broader scope", () => {
  const plan = buildRetrievalFallbackPlan({
    normalized: "vendor questionnaire",
    expanded: "vendor supplier questionnaire",
    aggressiveExpanded: "vendor supplier third party tprm questionnaire"
  });

  assert.equal(plan[1]?.stage, "fallback_synonym_expansion");
  assert.equal(plan[2]?.keywordOnly, true);
  assert.equal(plan[3]?.relaxMetadataFilters, true);
  assert.equal(plan[4]?.relaxTargetScope, true);
});

test("duplicate and near-duplicate chunks are removed while preserving diversity", () => {
  const chunks: RetrievalChunk[] = [
    {
      chunk_id: "1",
      content: "Supplier onboarding requires due diligence and third-party risk screening before approval.",
      document_id: "d1",
      document_name: "Policy A",
      folder_path: "Procurement",
      page_number: 1,
      section_title: "Overview",
      score: 0.9
    },
    {
      chunk_id: "2",
      content: "Supplier onboarding requires due diligence and third-party risk screening before approval.",
      document_id: "d1",
      document_name: "Policy A",
      folder_path: "Procurement",
      page_number: 1,
      section_title: "Overview",
      score: 0.88
    },
    {
      chunk_id: "3",
      content: "Purchase requisitions must be approved by Finance before a purchase order is issued.",
      document_id: "d2",
      document_name: "Policy B",
      folder_path: "Procurement",
      page_number: 2,
      section_title: "Approvals",
      score: 0.85
    }
  ];

  const selected = selectDiverseChunks(chunks, 2, 8);
  assert.equal(selected.length, 2);
  assert.deepEqual(selected.map((chunk) => chunk.chunk_id), ["1", "3"]);
});

test("citation generation preserves chunk id and source metadata", () => {
  const chunks: RetrievalChunk[] = [
    {
      chunk_id: "chunk-9",
      content: "The MSA effective date is 2026-01-01.",
      document_id: "doc-1",
      document_name: "MSA",
      document_type: "contract",
      folder_path: "Contracts",
      page_number: 4,
      section_title: "Term",
      section_path: "Agreement > Term",
      effective_date: "2026-01-01",
      score: 0.81
    }
  ];

  const citations = CitationEngine.build_citations(chunks);
  assert.equal(citations.length, 1);
  assert.equal(citations[0]?.chunk_id, "chunk-9");
  assert.equal(citations[0]?.section_path, "Agreement > Term");
});

test("unsupported factual answers are rejected by grounding checks", () => {
  const chunks: RetrievalChunk[] = [
    {
      chunk_id: "c1",
      content: "Purchase orders require manager approval.",
      document_id: "doc-1",
      document_name: "PO Policy",
      folder_path: "Procurement",
      page_number: 1,
      section_title: "Policy",
      score: 0.7
    }
  ];

  const answer = "Invoices are always paid within 7 days.";
  assert.equal(shouldRequireCitations(answer), true);
  assert.equal(isAnswerGrounded(answer, chunks), false);
});

test("failed or empty document parsing is detected", () => {
  const quality = assessParseQuality({
    title: "",
    pages: [{ page_number: 1, text: "   " }],
    metadata: { page_count: 1 }
  });

  assert.equal(quality.isEmpty, true);
  assert.equal(quality.isPoorQuality, true);
});

test("filter diagnostics flags likely exclusion when indexed docs exist but retrieval stays empty", () => {
  const risk = detectFilterExclusionRisk({
    accessibleIndexedDocuments: 12,
    targetScopedAccessibleDocuments: 0,
    hasTargetScope: true,
    attempts: [
      { stage: "primary_hybrid", afterFiltersCount: 0 },
      { stage: "fallback_synonym_expansion", afterFiltersCount: 0 }
    ]
  });

  assert.equal(risk.targetScopeExcludedAll, true);
  assert.equal(risk.likelyFilterExclusion, true);
});
