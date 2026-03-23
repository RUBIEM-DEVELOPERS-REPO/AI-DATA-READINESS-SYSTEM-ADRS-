import type { CdmEntity } from "@shared/schema";

// ─── Golden Record Engine ─────────────────────────────────────────────────────
//
// Uses deterministic evidence-based grouping only — no hallucinations.
// An entity is merged into a golden record when it shares:
//   • Exact normalised name, OR
//   • Same email address, OR
//   • Same phone suffix (last 9 digits)
// across at least one of those three signals.
//
// The golden record is the entity in each group with the highest
// confidence score.  All others get a `goldenRecordId` pointing to it.

export interface GoldenGroup {
  goldenEntityId: string;
  goldenDisplayName: string;
  mergedEntityIds: string[];
  matchReasons: string[];
  confidence: number;
  entityType: string;
}

// ─── Name normalisation ───────────────────────────────────────────────────────
// Strip titles, punctuation, extra spaces; lowercase.
const TITLE_TOKENS = new Set([
  "mr", "mrs", "ms", "miss", "dr", "prof", "sir", "rev", "hon",
  "the", "a", "an",
]);

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\-'()&]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 0 && !TITLE_TOKENS.has(t))
    .sort()            // sort tokens → "doe john" === "john doe"
    .join(" ")
    .trim();
}

// ─── Contact-signal extractors ────────────────────────────────────────────────
function extractEmail(fields: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(fields)) {
    if (k.includes("email") && typeof v === "string" && v.includes("@")) {
      return v.toLowerCase().trim();
    }
  }
  return null;
}

function extractPhone(fields: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(fields)) {
    if ((k.includes("phone") || k.includes("mobile")) && typeof v === "string") {
      const digits = v.replace(/\D/g, "");
      if (digits.length >= 7) return digits.slice(-9);
    }
  }
  return null;
}

// ─── Core grouping algorithm ──────────────────────────────────────────────────
export function groupEntitiesForMerge(entities: CdmEntity[]): GoldenGroup[] {
  // Only PERSON and ORGANIZATION entities are resolved — DOCUMENT entities
  // are document-level records and should not be merged with parties.
  const candidates = entities.filter(e =>
    e.entityType === "PERSON" || e.entityType === "ORGANIZATION"
  );

  // Each group is stored as { key → CdmEntity[] }
  // Key is a stable fingerprint, not used externally.
  const groups: Map<string, { entities: CdmEntity[]; reasons: string[] }> = new Map();

  for (const entity of candidates) {
    const fields = entity.canonicalFields as Record<string, unknown>;
    const normName = normaliseName(entity.displayName);
    const email    = extractEmail(fields);
    const phone    = extractPhone(fields);

    let assigned = false;

    for (const [, group] of groups) {
      const rep      = group.entities[0];
      const repFields = rep.canonicalFields as Record<string, unknown>;
      const repNorm  = normaliseName(rep.displayName);
      const repEmail = extractEmail(repFields);
      const repPhone = extractPhone(repFields);

      const nameMatch  = normName.length > 0 && normName === repNorm;
      const emailMatch = email && repEmail && email === repEmail;
      const phoneMatch = phone && repPhone && phone === repPhone;

      if (nameMatch || emailMatch || phoneMatch) {
        group.entities.push(entity);
        if (nameMatch && !group.reasons.includes("name"))   group.reasons.push("name");
        if (emailMatch && !group.reasons.includes("email")) group.reasons.push("email");
        if (phoneMatch && !group.reasons.includes("phone")) group.reasons.push("phone");
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      const key = `${normName}|${email ?? ""}|${phone ?? ""}|${entity.id}`;
      groups.set(key, { entities: [entity], reasons: [] });
    }
  }

  const results: GoldenGroup[] = [];

  for (const [, group] of groups) {
    if (group.entities.length <= 1) continue;

    // Golden record = highest confidence first, then oldest (most established)
    group.entities.sort((a, b) => {
      if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const golden  = group.entities[0];
    const rest    = group.entities.slice(1);

    results.push({
      goldenEntityId:  golden.id,
      goldenDisplayName: golden.displayName,
      mergedEntityIds: rest.map(e => e.id),
      matchReasons:    group.reasons.length > 0 ? group.reasons : ["name"],
      confidence:      golden.confidenceScore,
      entityType:      golden.entityType,
    });
  }

  return results;
}
