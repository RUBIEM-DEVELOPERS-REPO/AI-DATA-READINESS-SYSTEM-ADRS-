/**
 * Moonshot 2: Neuro-Symbolic Reasoning Engine
 * 
 * This module enforces strict Subject-Predicate-Object constraints on the Knowledge Graph.
 * It prevents the AI's probabilistic extraction from generating logically impossible edges.
 */

export interface OntologyRule {
  allowedSources: string[];
  allowedTargets: string[];
  autoCorrectTarget?: string; // If violated, try changing relationship to this
}

// Map of relationship types to their strict logical rules
export const OntologyAxioms: Record<string, OntologyRule> = {
  "ISSUED_BY": {
    allowedSources: ["DOCUMENT", "TRANSACTION"],
    allowedTargets: ["ORGANIZATION", "PERSON"],
  },
  "ISSUED_TO": {
    allowedSources: ["DOCUMENT", "TRANSACTION"],
    allowedTargets: ["ORGANIZATION", "PERSON"],
  },
  "EMPLOYED_BY": {
    allowedSources: ["PERSON"],
    allowedTargets: ["ORGANIZATION"],
  },
  "SUBJECT_OF": {
    allowedSources: ["PERSON", "ORGANIZATION", "ASSET"],
    allowedTargets: ["DOCUMENT"],
    autoCorrectTarget: "MENTIONED_IN"
  },
  "SIGNED_BY": {
    allowedSources: ["DOCUMENT", "AGREEMENT", "CONTRACT"],
    allowedTargets: ["PERSON", "ORGANIZATION"],
  },
  "MENTIONED_IN": {
    allowedSources: ["PERSON", "ORGANIZATION", "TRANSACTION", "ASSET"],
    allowedTargets: ["DOCUMENT"],
  }
};

export interface EdgeValidationResult {
  isValid: boolean;
  correctedRelationshipType?: string;
  rejectionReason?: string;
}

/**
 * Validates a proposed semantic edge against the ontology axioms.
 * Returns the corrected relationship if an auto-correction is available, or rejects it.
 */
export function validateAndCorrectEdge(
  sourceType: string,
  targetType: string,
  proposedRelationship: string
): EdgeValidationResult {
  const rule = OntologyAxioms[proposedRelationship.toUpperCase()];
  
  // If we don't have strict rules for this relationship, allow it (fallback)
  if (!rule) {
    return { isValid: true, correctedRelationshipType: proposedRelationship };
  }

  const validSource = rule.allowedSources.includes(sourceType.toUpperCase());
  const validTarget = rule.allowedTargets.includes(targetType.toUpperCase());

  if (validSource && validTarget) {
    return { isValid: true, correctedRelationshipType: proposedRelationship };
  }

  // Violation detected! Try auto-correction logic
  if (rule.autoCorrectTarget) {
    // Recursively check if the auto-corrected rule works
    const correctionCheck = validateAndCorrectEdge(sourceType, targetType, rule.autoCorrectTarget);
    if (correctionCheck.isValid) {
      console.log(`[Ontology] Auto-corrected ${sourceType} -> ${proposedRelationship} -> ${targetType} to ${rule.autoCorrectTarget}`);
      return { isValid: true, correctedRelationshipType: rule.autoCorrectTarget };
    }
  }

  // Failsafe inverse check (AI often flips Source and Target)
  const validInverseSource = rule.allowedSources.includes(targetType.toUpperCase());
  const validInverseTarget = rule.allowedTargets.includes(sourceType.toUpperCase());
  if (validInverseSource && validInverseTarget) {
     return { 
       isValid: false, 
       rejectionReason: `Ontological flip: The AI likely inverted the source and target for ${proposedRelationship}. Expected Source: ${rule.allowedSources.join("|")}` 
     };
  }

  // Complete violation
  return { 
    isValid: false, 
    rejectionReason: `Ontological impossibility: ${sourceType} cannot be connected to ${targetType} via ${proposedRelationship}` 
  };
}
