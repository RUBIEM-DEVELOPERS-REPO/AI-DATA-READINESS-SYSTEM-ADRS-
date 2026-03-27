import type { CdmEntity } from "@shared/schema";
import { ADRS_CONFIG } from "../config";

// ─── Golden Record Engine v2 ──────────────────────────────────────────────────
//
// Improvements over v1:
//   • Field-union merging: canonical fields from all merged entities are combined;
//     each field takes the value from the highest-confidence source.
//   • Quarantine detection: name-only match on ≤ 2 name tokens → quarantined merge.
//   • Explanation trail: per-field source decision recorded.
//   • Singleton promotion: entities not in any merge group are promoted to GOLDEN
//     automatically (they are already the unique representative of their identity).
//   • Source ranking: ordered by confidence score, then by creation date (oldest first).

export interface FieldMergeDecision {
  field_key: string;
  chosen_value: any;
  chosen_from_entity_id: string;
  chosen_confidence: number;
  conflict: boolean;
  all_values: Array<{ entity_id: string; value: any; confidence: number }>;
}

export interface GoldenGroup {
  goldenEntityId: string;
  goldenDisplayName: string;
  mergedEntityIds: string[];
  matchReasons: string[];
  confidence: number;
  entityType: string;
  // v2 additions
  isQuarantined: boolean;
  quarantineReason?: string;
  fieldMergeDecisions: FieldMergeDecision[];
  mergedCanonicalFields: Record<string, any>;
  explanation: string[];
  sourceRanking: Array<{ entityId: string; confidence: number; evidenceIds: string[] }>;
}

export interface SingletonGroup {
  entityId: string;
  displayName: string;
  entityType: string;
  confidence: number;
  lifecycle: "GOLDEN";
  lifecycleReason: string;
}

// ─── Name normalisation ───────────────────────────────────────────────────────
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
    .sort()
    .join(" ")
    .trim();
}

// ─── Contact-signal extractors ────────────────────────────────────────────────
function extractEmail(fields: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(fields)) {
    if (k.includes("email") && typeof v === "string" && v.includes("@")) return v.toLowerCase().trim();
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

// ─── Field-union merge ────────────────────────────────────────────────────────
/**
 * Merge canonical fields from multiple entities.
 *
 * Strategy:
 *  • For each field key, the value from the entity with the HIGHEST confidence score wins.
 *  • If two entities share the same confidence, prefer the oldest (lowest createdAt).
 *  • All candidate values are recorded in the FieldMergeDecision trail.
 */
function fieldUnionMerge(
  entities: CdmEntity[]
): { merged: Record<string, any>; decisions: FieldMergeDecision[] } {
  // Collect all field keys across all entities
  const allKeys = new Set<string>();
  for (const e of entities) {
    const fields = e.canonicalFields as Record<string, any>;
    Object.keys(fields).forEach(k => allKeys.add(k));
  }

  const merged: Record<string, any> = {};
  const decisions: FieldMergeDecision[] = [];

  for (const key of allKeys) {
    const candidates: Array<{ entity_id: string; value: any; confidence: number }> = [];

    for (const e of entities) {
      const fields = e.canonicalFields as Record<string, any>;
      if (Object.prototype.hasOwnProperty.call(fields, key) && fields[key] != null) {
        candidates.push({ entity_id: e.id, value: fields[key], confidence: e.confidenceScore });
      }
    }

    if (candidates.length === 0) continue;

    // Pick highest-confidence value; tie-break = first in array (oldest by sort)
    const best = candidates.reduce((a, b) => b.confidence > a.confidence ? b : a);
    const allValues = [...new Set(candidates.map(c => String(c.value)))];
    const hasConflict = allValues.length > 1;

    merged[key] = best.value;
    decisions.push({
      field_key: key,
      chosen_value: best.value,
      chosen_from_entity_id: best.entity_id,
      chosen_confidence: best.confidence,
      conflict: hasConflict,
      all_values: candidates,
    });
  }

  return { merged, decisions };
}

// ─── Quarantine check for ambiguous merges ────────────────────────────────────
/**
 * A merge is ambiguous (and should be quarantined) when:
 *   • The ONLY match reason is "name" (no email/phone corroboration), AND
 *   • The normalised name has ≤ 2 tokens (too short to be uniquely identifying)
 *
 * Example: Two entities named "John" matched only by name → quarantine.
 */
function isAmbiguousMerge(normName: string, matchReasons: string[]): boolean {
  if (!ADRS_CONFIG.lifecycle.quarantine_short_name_only_merge) return false;
  if (matchReasons.length === 1 && matchReasons[0] === "name") {
    const tokenCount = normName.split(/\s+/).filter(Boolean).length;
    return tokenCount <= 2;
  }
  return false;
}

// ─── Core grouping algorithm ──────────────────────────────────────────────────
export function groupEntitiesForMerge(entities: CdmEntity[]): GoldenGroup[] {
  const candidates = entities.filter(e =>
    e.entityType === "PERSON" || e.entityType === "ORGANIZATION"
  );

  const groups: Map<string, { entities: CdmEntity[]; reasons: string[] }> = new Map();

  for (const entity of candidates) {
    const fields    = entity.canonicalFields as Record<string, unknown>;
    const normName  = normaliseName(entity.displayName);
    const email     = extractEmail(fields);
    const phone     = extractPhone(fields);

    let assigned = false;

    for (const [, group] of groups) {
      const rep       = group.entities[0];
      const repFields = rep.canonicalFields as Record<string, unknown>;
      const repNorm   = normaliseName(rep.displayName);
      const repEmail  = extractEmail(repFields);
      const repPhone  = extractPhone(repFields);

      const nameMatch  = normName.length > 0 && normName === repNorm;
      const emailMatch = !!(email && repEmail && email === repEmail);
      const phoneMatch = !!(phone && repPhone && phone === repPhone);

      if (nameMatch || emailMatch || phoneMatch) {
        group.entities.push(entity);
        if (nameMatch  && !group.reasons.includes("name"))  group.reasons.push("name");
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

    // Source ranking: highest confidence first, then oldest
    group.entities.sort((a, b) => {
      if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const golden = group.entities[0];
    const rest   = group.entities.slice(1);
    const matchReasons = group.reasons.length > 0 ? group.reasons : ["name"];
    const normName = normaliseName(golden.displayName);

    // Check for ambiguous merge (quarantine if needed)
    const shouldQuarantine = isAmbiguousMerge(normName, matchReasons);
    const quarantineReason = shouldQuarantine
      ? `Name-only match on short name "${golden.displayName}" (${normName.split(/\s+/).length} tokens). Requires human confirmation.`
      : undefined;

    // Field-union merge across all entities in the group
    const { merged: mergedCanonicalFields, decisions: fieldMergeDecisions } = fieldUnionMerge(group.entities);

    // Source ranking for explanation
    const sourceRanking = group.entities.map(e => ({
      entityId: e.id,
      confidence: e.confidenceScore,
      evidenceIds: e.sourceEvidenceIds ?? [],
    }));

    // Build human-readable explanation trail
    const explanation: string[] = [
      `Merged ${group.entities.length} entity record(s) into golden record "${golden.displayName}".`,
      `Match signals: ${matchReasons.join(", ")}.`,
      `Source ranking (highest confidence first): ${sourceRanking.map((s, n) => `#${n + 1}: ${s.entityId} (conf: ${(s.confidence * 100).toFixed(0)}%)`).join("; ")}.`,
    ];
    const conflictedFields = fieldMergeDecisions.filter(d => d.conflict);
    if (conflictedFields.length > 0) {
      explanation.push(`Field conflicts resolved: ${conflictedFields.map(d => `${d.field_key} → chose "${d.chosen_value}" from entity ${d.chosen_from_entity_id}`).join("; ")}.`);
    }
    if (shouldQuarantine) {
      explanation.push(`⚠ Quarantined: ${quarantineReason}`);
    }

    results.push({
      goldenEntityId:      golden.id,
      goldenDisplayName:   golden.displayName,
      mergedEntityIds:     rest.map(e => e.id),
      matchReasons,
      confidence:          golden.confidenceScore,
      entityType:          golden.entityType,
      isQuarantined:       shouldQuarantine,
      quarantineReason,
      fieldMergeDecisions,
      mergedCanonicalFields,
      explanation,
      sourceRanking,
    });
  }

  return results;
}

// ─── Singleton promotion ──────────────────────────────────────────────────────
/**
 * Identifies entities that were NOT merged into any group.
 * These are the unique representative of their identity and should be
 * auto-promoted to GOLDEN (no merge needed, already canonical).
 *
 * Returns the IDs of singleton entities along with their proposed lifecycle.
 */
export function getSingletonEntityIds(
  entities: CdmEntity[],
  groups: GoldenGroup[]
): SingletonGroup[] {
  if (!ADRS_CONFIG.lifecycle.auto_promote_singletons) return [];

  // Build set of all entity IDs already in a merge group
  const inGroupIds = new Set<string>();
  for (const g of groups) {
    inGroupIds.add(g.goldenEntityId);
    g.mergedEntityIds.forEach(id => inGroupIds.add(id));
  }

  const candidates = entities.filter(
    e => (e.entityType === "PERSON" || e.entityType === "ORGANIZATION") &&
         !inGroupIds.has(e.id)
  );

  return candidates.map(e => ({
    entityId: e.id,
    displayName: e.displayName,
    entityType: e.entityType,
    confidence: e.confidenceScore,
    lifecycle: "GOLDEN" as const,
    lifecycleReason: "Singleton entity: no duplicates found across all evidence; auto-promoted to GOLDEN",
  }));
}
