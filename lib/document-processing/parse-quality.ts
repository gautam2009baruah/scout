import type { ParsedDocumentOutput } from "./parsers";

export type ParseQualityAssessment = {
  totalCharacters: number;
  sparsePages: number;
  sparseRatio: number;
  isEmpty: boolean;
  isPoorQuality: boolean;
};

export function assessParseQuality(output: ParsedDocumentOutput): ParseQualityAssessment {
  const totalCharacters = output.pages.reduce((sum, page) => sum + String(page.text || "").trim().length, 0);
  const sparsePages = output.pages.filter((page) => String(page.text || "").trim().length < 20).length;
  const sparseRatio = output.pages.length > 0 ? sparsePages / output.pages.length : 1;

  return {
    totalCharacters,
    sparsePages,
    sparseRatio,
    isEmpty: output.pages.length === 0 || totalCharacters === 0,
    isPoorQuality: sparseRatio >= 0.8
  };
}
