import crypto from "crypto";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export type TeeQuote = {
  scheme: "TEEQ_STUB" | "REAL";
  quoteId: string;
  // In real deployments these would be produced by a TEE attestation provider
  pcrs: Record<string, string>;
  enclaveMrEnclaveHash: string;
  enclaveMRSigHash: string;
  issuedAt: string;
};

export type EnclaveAttestationBundle = {
  evidenceOrRunId: string;
  teeQuote: TeeQuote;
  inputCommitment: string;
  outputCommitment: string;
  // Proof that the transcript + compliance facts were generated in enclave
  transcriptHash: string;
};

export type TeeExecutionResult<T> = {
  result: T;
  attestation: EnclaveAttestationBundle;
};

// MVP: abstraction layer. Later we can swap STUB implementation with real
// Intel SGX/TDX/SEV-SNP attestation + enclave runtime.
export async function executeInEnclave<T>(params: {
  evidenceOrRunId: string;
  sensitiveInput: unknown; // should never be logged
  sensitiveOutput: unknown;
  transcript: string; // hashable deterministic transcript
  fn: () => Promise<T>;
}): Promise<TeeExecutionResult<T>> {
  const { evidenceOrRunId, sensitiveInput, sensitiveOutput, transcript, fn } = params;

  // Commitments (do not store plaintext input/output)
  const inputCommitment = sha256Hex(JSON.stringify(sensitiveInput));
  const outputCommitment = sha256Hex(JSON.stringify(sensitiveOutput));
  const transcriptHash = sha256Hex(transcript);

  const teeQuote: TeeQuote = {
    scheme: "TEEQ_STUB",
    quoteId: `quote_${sha256Hex(`${evidenceOrRunId}:${Date.now()}`)}`,
    pcrs: {
      pcr0: sha256Hex("pcr0"),
      pcr1: sha256Hex("pcr1"),
    },
    enclaveMrEnclaveHash: sha256Hex("mr_enclave"),
    enclaveMRSigHash: sha256Hex("mr_signer"),
    issuedAt: new Date().toISOString(),
  };

  // Execute enclave function (in MVP this is just server-side execution)
  const result = await fn();

  const attestation: EnclaveAttestationBundle = {
    evidenceOrRunId,
    teeQuote,
    inputCommitment,
    outputCommitment,
    transcriptHash,
  };

  return { result, attestation };
}

