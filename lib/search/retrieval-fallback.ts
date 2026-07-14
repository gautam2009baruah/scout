export type RetrievalFallbackStep = {
  stage: string;
  searchQuery: string;
  keywordOnly: boolean;
  relaxMetadataFilters: boolean;
  relaxTargetScope: boolean;
};

export function buildRetrievalFallbackPlan(input: {
  normalized: string;
  expanded: string;
  aggressiveExpanded: string;
}): RetrievalFallbackStep[] {
  return [
    {
      stage: "primary_hybrid",
      searchQuery: input.normalized,
      keywordOnly: false,
      relaxMetadataFilters: false,
      relaxTargetScope: false
    },
    {
      stage: "fallback_synonym_expansion",
      searchQuery: input.expanded,
      keywordOnly: false,
      relaxMetadataFilters: false,
      relaxTargetScope: false
    },
    {
      stage: "fallback_keyword_only",
      searchQuery: input.expanded,
      keywordOnly: true,
      relaxMetadataFilters: false,
      relaxTargetScope: false
    },
    {
      stage: "fallback_relax_metadata_filters",
      searchQuery: input.aggressiveExpanded,
      keywordOnly: true,
      relaxMetadataFilters: true,
      relaxTargetScope: false
    },
    {
      stage: "fallback_broader_document_categories",
      searchQuery: input.aggressiveExpanded,
      keywordOnly: false,
      relaxMetadataFilters: true,
      relaxTargetScope: true
    }
  ];
}
