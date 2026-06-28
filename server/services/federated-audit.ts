import crypto from "crypto";
import type { ZkpProof } from "./zkp-audit";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export type FederatedAuditRequest = {
  requestId: string;
  tenantId: string;
  jurisdiction: string;
  crossBorder: boolean;
  // regulator requests a schema/conditions list, not personal data
  requiredComplianceConditions: string[];
  // scope is what org should compute locally
  evidenceOrRunsScope: {
    evidenceIds?: string[];
    extractionRunIds?: string[];
    datasetCodes?: string[];
  };
  createdAt: string;
};

export type FederatedAuditResponse = {
  requestId: string;
  tenantId: string;
  orgComputedAt: string;
  aggregatesCommitment: string;
  proofs: ZkpProof[];
  // minimal compliance metrics; no raw data
  complianceSummary: {
    allConditionsSatisfied: boolean;
    failedConditions: string[];
  };
};

// MVP stub: org returns commitments + proofs (no raw data).
// Real implementation would include policy engine evaluation + ZKP generation.
export async function createFederatedAuditRequest(params: {
  tenantId: string;
  jurisdiction: string;
  crossBorder: boolean;
  requiredComplianceConditions: string[];
  evidenceOrRunsScope: FederatedAuditRequest["evidenceOrRunsScope"];
}): Promise<FederatedAuditRequest> {
  const requestId = `fed_${sha256Hex(`${params.tenantId}:${Date.now()}`)}`;
  return {
    requestId,
    tenantId: params.tenantId,
    jurisdiction: params.jurisdiction,
    crossBorder: params.crossBorder,
    requiredComplianceConditions: params.requiredComplianceConditions,
    evidenceOrRunsScope: params.evidenceOrRunsScope,
    createdAt: new Date().toISOString(),
  };
}

export async function createFederatedAuditResponse(params: {
  request: FederatedAuditRequest;
  tenantId: string;
  zkpProofs: ZkpProof[];
  failedConditions: string[];
}): Promise<FederatedAuditResponse> {
  const { request, tenantId, zkpProofs, failedConditions } = params;

  const aggregatesCommitment = sha256Hex(
    JSON.stringify({
      requestId: request.requestId,
      proofs: zkpProofs.map(p => ({ proofId: p.proofId, commitment: p.statementsCommitment, failed: p.failedConditions })),
    })
  );

  return {
    requestId: request.requestId,
    tenantId,
    orgComputedAt: new Date().toISOString(),
    aggregatesCommitment,
    proofs: zkpProofs,
    complianceSummary: {
      allConditionsSatisfied: failedConditions.length === 0,
      failedConditions,
    },
  };
}

