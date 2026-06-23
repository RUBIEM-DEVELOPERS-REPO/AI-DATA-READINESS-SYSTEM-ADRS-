import type { NormalizedAttribute } from "@shared/schema";

export interface GroundTruthEntry {
  field_key: string;
  expected_value: string;
  doc_type: string;
}

export interface FieldResult {
  field_key: string;
  expected: string;
  actual: string;
  match: "exact" | "partial" | "miss";
  normalized_correctly: boolean;
}

export interface EvaluationReport {
  docType: string;
  totalFields: number;
  exactMatches: number;
  partialMatches: number;
  misses: number;
  precision: number;
  recall: number;
  f1Score: number;
  normalizationAccuracy: number;
  fieldBreakdown: FieldResult[];
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export function evaluateExtraction(
  groundTruth: GroundTruthEntry[],
  extractedAttributes: NormalizedAttribute[]
): EvaluationReport {
  const docType = groundTruth[0]?.doc_type ?? "UNKNOWN";
  const fieldBreakdown: FieldResult[] = [];

  let exactMatches = 0;
  let partialMatches = 0;
  let misses = 0;
  let normalizedCorrectly = 0;

  for (const gt of groundTruth) {
    const attr = extractedAttributes.find(
      (a) => a.field_key.toLowerCase() === gt.field_key.toLowerCase()
    );

    const actual = attr?.value_normalized ?? "";
    const expected = gt.expected_value ?? "";
    const expectedNorm = expected.trim().toLowerCase();
    const actualNorm = actual.trim().toLowerCase();

    let match: "exact" | "partial" | "miss" = "miss";

    if (expectedNorm === actualNorm) {
      match = "exact";
      exactMatches++;
    } else if (
      actualNorm.includes(expectedNorm) ||
      expectedNorm.includes(actualNorm) ||
      (expectedNorm.length > 0 &&
        levenshtein(expectedNorm, actualNorm) / Math.max(expectedNorm.length, 1) < 0.2)
    ) {
      match = "partial";
      partialMatches++;
    } else {
      misses++;
    }

    const isNormalizedCorrectly =
      attr?.normalization_status === "SUCCESS" || attr?.normalization_status === "SKIPPED";

    if (isNormalizedCorrectly) normalizedCorrectly++;

    fieldBreakdown.push({
      field_key: gt.field_key,
      expected,
      actual,
      match,
      normalized_correctly: isNormalizedCorrectly,
    });
  }

  const total = groundTruth.length;
  const precision = total > 0 ? exactMatches / total : 0;
  const recall =
    exactMatches + misses > 0 ? exactMatches / (exactMatches + misses) : 0;
  const f1Score =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;
  const normalizationAccuracy = total > 0 ? normalizedCorrectly / total : 0;

  return {
    docType,
    totalFields: total,
    exactMatches,
    partialMatches,
    misses,
    precision,
    recall,
    f1Score,
    normalizationAccuracy,
    fieldBreakdown,
  };
}
