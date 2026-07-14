const SYNONYM_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["vendor", "supplier", "third party", "third-party"],
  ["procurement request", "purchase requisition", "pr", "requisition"],
  ["rfp", "request for proposal", "rfq", "request for quotation", "tender"],
  ["po", "purchase order", "p.o."],
  ["contract", "agreement", "msa", "master services agreement", "sow", "statement of work"],
  ["invoice", "accounts payable", "ap", "billing"],
  ["compliance", "due diligence", "ddq", "assessment"],
  ["third-party risk", "third party risk", "tprm", "vendor risk"]
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function canonical(value: string) {
  return normalizeWhitespace(value.toLowerCase().replace(/[\u2013\u2014]/g, "-").replace(/[^a-z0-9\s-]/g, " "));
}

function containsPhrase(haystack: string, phrase: string) {
  return haystack.includes(canonical(phrase));
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((item) => normalizeWhitespace(item)).filter(Boolean)));
}

export type NormalizedQuery = {
  normalized: string;
  expanded: string;
  aggressiveExpanded: string;
  terms: string[];
  matchedGroups: string[][];
};

export function normalizeAndExpandProcurementQuery(query: string): NormalizedQuery {
  const normalized = canonical(query);
  const terms = normalized.split(" ").filter(Boolean);
  const matchedGroups = SYNONYM_GROUPS
    .map((group) => group.map((term) => canonical(term)))
    .filter((group) => group.some((term) => containsPhrase(normalized, term)));

  const matchedSynonyms = uniq(matchedGroups.flat());
  const allSynonyms = uniq(SYNONYM_GROUPS.flat().map((term) => canonical(term)));

  return {
    normalized,
    expanded: uniq([normalized, ...matchedSynonyms]).join(" "),
    aggressiveExpanded: uniq([normalized, ...matchedSynonyms, ...allSynonyms]).join(" "),
    terms,
    matchedGroups
  };
}
