/**
 * Design Tokens & Theme System
 * Centralized source of truth for enterprise UI consistency
 */

// ─── Typography Scale (Modular 1.125x scale) ─────────────────────────────
export const TYPOGRAPHY = {
  // Display (hero/page titles)
  display: { size: "2.488rem", weight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" },
  
  // Heading hierarchy
  h1: { size: "1.952rem", weight: 700, lineHeight: 1.2, letterSpacing: "-0.01em" },
  h2: { size: "1.735rem", weight: 600, lineHeight: 1.3, letterSpacing: "-0.005em" },
  h3: { size: "1.5rem", weight: 600, lineHeight: 1.4 },
  h4: { size: "1.333rem", weight: 600, lineHeight: 1.4 },
  h5: { size: "1.125rem", weight: 600, lineHeight: 1.4 },
  
  // Body text
  body: { size: "1rem", weight: 400, lineHeight: 1.5 },
  bodySmall: { size: "0.875rem", weight: 400, lineHeight: 1.5 },
  bodyXSmall: { size: "0.8rem", weight: 400, lineHeight: 1.5 },
  
  // Labels & UI text (never go smaller than 12px for accessibility)
  label: { size: "0.875rem", weight: 500, lineHeight: 1.4 },
  labelSmall: { size: "0.8rem", weight: 500, lineHeight: 1.4 },
  
  // Monospace (code, IDs)
  mono: { size: "0.875rem", weight: 500, fontFamily: "'Monaco', 'Courier New', monospace" },
  monoSmall: { size: "0.8rem", weight: 500, fontFamily: "'Monaco', 'Courier New', monospace" },
};

// ─── Spacing System (8px base) ──────────────────────────────────────────
export const SPACING = {
  xxs: "0.25rem",  // 4px
  xs: "0.5rem",    // 8px
  sm: "1rem",      // 16px
  md: "1.5rem",    // 24px
  lg: "2rem",      // 32px
  xl: "2.5rem",    // 40px
  xxl: "3rem",     // 48px
  xxxl: "4rem",    // 64px
};

// ─── Color Palette (Semantic) ──────────────────────────────────────────
export const COLORS = {
  // Status: Success (compliance, resolved)
  success: "#10b981",
  successBg: "rgba(16, 185, 129, 0.1)",
  successBorder: "rgba(16, 185, 129, 0.3)",
  
  // Status: Warning (attention needed, SLA at risk)
  warning: "#f59e0b",
  warningBg: "rgba(245, 158, 11, 0.1)",
  warningBorder: "rgba(245, 158, 11, 0.3)",
  
  // Status: Alert (critical, SLA breached, urgent)
  alert: "#ef4444",
  alertBg: "rgba(239, 68, 68, 0.1)",
  alertBorder: "rgba(239, 68, 68, 0.3)",
  
  // Status: Info (neutral information)
  info: "#3b82f6",
  infoBg: "rgba(59, 130, 246, 0.1)",
  infoBorder: "rgba(59, 130, 246, 0.3)",
  
  // Semantic
  primary: "#6366f1",
  primaryBg: "rgba(99, 102, 241, 0.1)",
  primaryBorder: "rgba(99, 102, 241, 0.3)",
};

// ─── Risk Levels (Compliance scoring) ──────────────────────────────────
export const RISK_LEVELS = {
  LOW: { color: "#10b981", bg: "rgba(16, 185, 129, 0.1)", border: "rgba(16, 185, 129, 0.3)", label: "Low" },
  MEDIUM: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)", border: "rgba(245, 158, 11, 0.3)", label: "Medium" },
  HIGH: { color: "#f97316", bg: "rgba(249, 115, 22, 0.1)", border: "rgba(249, 115, 22, 0.3)", label: "High" },
  CRITICAL: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", label: "Critical" },
};

// ─── Status Mappings (Unified) ─────────────────────────────────────────
export const STATUS_STYLES = {
  // Generic statuses
  PENDING: { color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)", border: "rgba(59, 130, 246, 0.3)", icon: "⏳" },
  ACTIVE: { color: "#10b981", bg: "rgba(16, 185, 129, 0.1)", border: "rgba(16, 185, 129, 0.3)", icon: "✓" },
  COMPLETED: { color: "#10b981", bg: "rgba(16, 185, 129, 0.1)", border: "rgba(16, 185, 129, 0.3)", icon: "✓" },
  CLOSED: { color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)", border: "rgba(107, 114, 128, 0.3)", icon: "✓" },
  EXPIRED: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", icon: "✗" },
  
  // Workflow statuses
  APPROVED: { color: "#10b981", bg: "rgba(16, 185, 129, 0.1)", border: "rgba(16, 185, 129, 0.3)", icon: "✓" },
  REJECTED: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", icon: "✗" },
  UNDER_REVIEW: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)", border: "rgba(245, 158, 11, 0.3)", icon: "◔" },
  
  // SLA statuses
  ON_TRACK: { color: "#10b981", bg: "rgba(16, 185, 129, 0.1)", border: "rgba(16, 185, 129, 0.3)", icon: "✓" },
  AT_RISK: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)", border: "rgba(245, 158, 11, 0.3)", icon: "⚠" },
  BREACHED: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", icon: "✗" },
  
  // Integration statuses
  CONNECTED: { color: "#10b981", bg: "rgba(16, 185, 129, 0.1)", border: "rgba(16, 185, 129, 0.3)", icon: "◉" },
  DISCONNECTED: { color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)", border: "rgba(107, 114, 128, 0.3)", icon: "○" },
  ERROR: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)", border: "rgba(239, 68, 68, 0.3)", icon: "✗" },
};

// ─── Shadow System (Depth hierarchy) ────────────────────────────────────
export const SHADOWS = {
  sm: "0 1px 2px rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px rgba(0, 0, 0, 0.1)",
  xl: "0 20px 25px rgba(0, 0, 0, 0.15)",
  elevation: {
    low: "0 1px 3px rgba(0, 0, 0, 0.08)",
    medium: "0 4px 12px rgba(0, 0, 0, 0.12)",
    high: "0 12px 32px rgba(0, 0, 0, 0.16)",
  },
};

// ─── Border Radius (Consistency) ────────────────────────────────────────
export const RADII = {
  none: "0",
  sm: "0.375rem",    // 6px
  md: "0.5rem",      // 8px
  lg: "0.75rem",     // 12px
  xl: "1rem",        // 16px
  full: "9999px",    // pill-shaped
};

// ─── Transitions (Microinteractions) ────────────────────────────────────
export const TRANSITIONS = {
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
  base: "250ms cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "350ms cubic-bezier(0.4, 0, 0.2, 1)",
};

// ─── Z-Index Hierarchy ──────────────────────────────────────────────────
export const Z_INDEX = {
  hide: -1,
  base: 0,
  dropdown: 40,
  sticky: 50,
  fixed: 100,
  modal: 200,
  popover: 300,
  tooltip: 400,
  notification: 500,
};

// ─── Utility Functions ──────────────────────────────────────────────────
export function getStatusStyle(status?: string) {
  if (!status) return STATUS_STYLES.PENDING;
  return STATUS_STYLES[status as keyof typeof STATUS_STYLES] || STATUS_STYLES.PENDING;
}

export function getRiskStyle(risk?: string) {
  if (!risk) return RISK_LEVELS.LOW;
  return RISK_LEVELS[risk as keyof typeof RISK_LEVELS] || RISK_LEVELS.LOW;
}

const TOKENS = {
  typography: TYPOGRAPHY,
  spacing: SPACING,
  colors: COLORS,
  risk: RISK_LEVELS,
  status: STATUS_STYLES,
  shadows: SHADOWS,
  radii: RADII,
  transitions: TRANSITIONS,
  zIndex: Z_INDEX,
};

function walkTokens(obj: Record<string, any>, prefix: string[] = [], result: Record<string, string> = {}) {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const next = prefix.concat(key);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      walkTokens(value, next, result);
    } else {
      result[`--drs-${next.join("-")}`] = String(value);
    }
  }
  return result;
}

export function generateCssVars(prefix = "drs") {
  const result: Record<string, string> = {};
  const walker = (obj: Record<string, any>, path: string[] = []) => {
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      const next = path.concat(key);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        walker(value, next);
      } else {
        result[`--${prefix}-${next.join("-")}`] = String(value);
      }
    }
  };
  walker(TOKENS);
  return result;
}

export function applyTokensToRoot(prefix = "drs") {
  if (typeof document === "undefined") return;
  const vars = generateCssVars(prefix);
  const root = document.documentElement;
  Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
}
