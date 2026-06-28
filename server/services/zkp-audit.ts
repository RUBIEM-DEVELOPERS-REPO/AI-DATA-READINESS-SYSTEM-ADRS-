export interface ZkpProof {
  id: string;
  tenantId: string;
  evidenceOrRunId: string;
  regulatorRequestId: string;
  scheme: string;
  proofId: string;
  statementsCommitment: string;
  statementCommitments: any;
  complianceAllConditionsSatisfied: boolean;
  failedConditions: string[];
  generatedAt: string;
  createdAt: Date;
}
