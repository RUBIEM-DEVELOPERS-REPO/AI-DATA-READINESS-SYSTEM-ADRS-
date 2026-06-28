import crypto from "crypto";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export type ZimbabweLanguage = "SHONA" | "NDEBELE" | "OTHER";

export function detectZimbabweLanguage(lang: string | undefined | null): ZimbabweLanguage {
  const l = String(lang ?? "").toLowerCase();
  if (l.includes("shona") || l.includes("sn")) return "SHONA";
  if (l.includes("ndebele") || l.includes("nbl") || l.includes("nr")) return "NDEBELE";
  return "OTHER";
}

export type SovereignLLMModelSelection = {
  language: ZimbabweLanguage;
  modelId: string;
  // domain separation for auditability
  selectionCommitment: string;
};

export function selectSovereignModel(params: {
  language: ZimbabweLanguage;
  tenantId: string;
}): SovereignLLMModelSelection {
  const { language, tenantId } = params;

  // MVP defaults; later replace with actual fine-tuned model registry + versions.
  const modelId =
    language === "SHONA"
      ? "zimb-llm-shona-ft-v1"
      : language === "NDEBELE"
      ? "zimb-llm-ndebele-ft-v1"
      : (process.env.AI_TEXT_MODEL || "llama-3.3-70b-versatile");

  return {
    language,
    modelId,
    selectionCommitment: sha256Hex(JSON.stringify({ language, modelId, tenantId })),
  };
}

