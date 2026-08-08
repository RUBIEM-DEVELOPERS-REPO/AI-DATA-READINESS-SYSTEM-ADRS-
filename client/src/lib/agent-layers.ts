// Shared route → agent-layer resolution for the floating AI widgets.
// Kept here so the Copilot and Agent Assist stay consistent per page.

export const ROUTE_LAYER: Record<string, string> = {
  "/": "system",
  "/dashboard": "system",
  "/evidence": "evidence",
  "/intelligence": "intelligence",
  "/cdm": "cdm",
  "/validation": "validation",
  "/feature-representation": "feature",
  "/intelligence-layer": "attention",
  "/graph": "graph",
  "/publishing": "publishing",
  "/agent-layer": "system",
  "/evaluate": "system",
  "/catalogue": "system",
  "/audit": "system",
  "/users": "system",
};

// Dynamic routes that can't be enumerated exactly (exact match wins first).
const PREFIX_LAYERS: Array<{ prefix: string; layer: string }> = [
  { prefix: "/graph", layer: "graph" },
  { prefix: "/connected-systems", layer: "dpo" },
];

export function resolveLayer(location: string): string {
  if (ROUTE_LAYER[location]) return ROUTE_LAYER[location];
  for (const { prefix, layer } of PREFIX_LAYERS) {
    if (location.startsWith(prefix)) return layer;
  }
  return "system";
}

export const LAYER_LABELS: Record<string, string> = {
  evidence: "Evidence · Ingestion",
  intelligence: "Multimodal Intelligence",
  cdm: "Canonical Data Model",
  feature: "Feature Representation",
  attention: "Context Intelligence",
  validation: "Trust & Validation",
  graph: "Knowledge Graph",
  publishing: "Dataset Publishing",
  dpo: "DPO Portal",
  system: "System · All Workspaces",
};
