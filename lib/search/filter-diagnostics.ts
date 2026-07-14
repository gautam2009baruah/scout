type RetrievalAttemptLike = {
  stage: string;
  afterFiltersCount: number;
};

export function detectFilterExclusionRisk(input: {
  accessibleIndexedDocuments: number;
  targetScopedAccessibleDocuments: number;
  hasTargetScope: boolean;
  attempts: RetrievalAttemptLike[];
}) {
  const zeroAcrossAttempts = input.attempts.every((attempt) => attempt.afterFiltersCount === 0);

  return {
    targetScopeExcludedAll: input.hasTargetScope
      && input.accessibleIndexedDocuments > 0
      && input.targetScopedAccessibleDocuments === 0,
    likelyFilterExclusion: input.accessibleIndexedDocuments > 0 && zeroAcrossAttempts
  };
}
