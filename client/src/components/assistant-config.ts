export type PortalAssistantKind = "admin" | "dpo" | "regulator" | "data-subject";

export interface PortalAssistantConfig {
  copilot: {
    title: string;
    subtitle: string;
    placeholder: string;
    initialMessage: string;
  };
  agent: {
    title: string;
    subtitle: string;
    initialMessage: string;
    layer: string;
  };
}

export function getPortalAssistantConfig(portal: PortalAssistantKind): PortalAssistantConfig {
  switch (portal) {
    case "admin":
      return {
        copilot: {
          title: "Admin Copilot",
          subtitle: "Administration workspace",
          placeholder: "Ask about connectors, users, and admin tasks...",
          initialMessage: "I can help you review administration tasks, connector health, and policy changes for this portal.",
        },
        agent: {
          title: "Admin Agent",
          subtitle: "Administration workflow assistant",
          initialMessage: "I can help triage admin operations, user changes, and configuration issues for this workspace.",
          layer: "system",
        },
      };
    case "dpo":
      return {
        copilot: {
          title: "DPO Copilot",
          subtitle: "DPO portal guidance",
          placeholder: "Ask about notices, requests, and obligations...",
          initialMessage: "I can help you review privacy notices, processing records, and data subject request obligations.",
        },
        agent: {
          title: "DPO Agent",
          subtitle: "DPO portal workflow assistant",
          initialMessage: "I can help you triage DSR workflows, privacy notices, and regulatory obligations here.",
          layer: "dpo",
        },
      };
    case "regulator":
      return {
        copilot: {
          title: "Regulator Copilot",
          subtitle: "Oversight and enforcement workspace",
          placeholder: "Ask about breaches, audits, and investigations...",
          initialMessage: "I can help summarise enforcement risk, pending approvals, and current oversight priorities.",
        },
        agent: {
          title: "Regulator Agent",
          subtitle: "Regulator workflow assistant",
          initialMessage: "I can help prioritise investigations, audit follow-ups, and regulatory actions for this portal.",
          layer: "system",
        },
      };
    case "data-subject":
      return {
        copilot: {
          title: "Data Subject Copilot",
          subtitle: "Public DSR intake guidance",
          placeholder: "Ask how to submit a request or what information is needed...",
          initialMessage: "I can help you understand the data subject request process and what to include in your submission.",
        },
        agent: {
          title: "Data Subject Agent",
          subtitle: "Public DSR intake guidance",
          initialMessage: "I can help you prepare a data subject request, identify the right controller, and explain the next steps.",
          layer: "system",
        },
      };
  }
}
