import { DiagnosisResult } from "../ai/GroqService";
import { RiskLevel } from "@aiops/types";

// ─── Rule-based risk patterns (cannot be overridden by LLM) ──────────────────

const HIGH_RISK_PATTERNS = [
  /migration[s]?\/.*\.sql/i,
  /terraform\//i,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM/i,
  /TRUNCATE\s+TABLE/i,
  /rm\s+-rf/i,
  /destroy/i,
  /iam.*policy/i,
  /production\/|\/prod\//i,
  /aws.*delete/i,
  /kubectl\s+delete/i,
  /helm\s+uninstall/i,
];

const MEDIUM_RISK_PATTERNS = [
  /Dockerfile/i,
  /\.github\/workflows\//i,
  /docker-compose/i,
  /\.env(\.|$)/i,
  /secrets\./i,
  /kubernetes\//i,
  /k8s\//i,
  /helm\//i,
  /nginx\.conf/i,
];

const LOW_RISK_PATTERNS = [
  /package\.json/i,
  /requirements\.txt/i,
  /go\.mod/i,
  /Gemfile/i,
  /README/i,
  /\.md$/i,
  /\.txt$/i,
  /\.py$/i,
  /\.js$/i,
  /\.ts$/i,
  /\.go$/i,
  /test\//i,
  /spec\//i,
  /docs\//i,
];

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyRisk(
  fixDiff: string,
  changedFiles: string[] = [],
  llmRisk?: RiskLevel
): RiskLevel {
  const textToCheck = [fixDiff, ...changedFiles].join("\n");

  // HIGH risk patterns always win — deterministic, cannot be overridden
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(textToCheck)) {
      console.log(`[RiskClassifier] HIGH risk detected via pattern: ${pattern}`);
      return "high";
    }
  }

  // MEDIUM risk patterns
  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(textToCheck)) {
      console.log(`[RiskClassifier] MEDIUM risk detected via pattern: ${pattern}`);
      // LLM can only escalate, not de-escalate medium to low
      return llmRisk === "high" ? "high" : "medium";
    }
  }

  // LOW risk check
  const isAllLowRisk =
    changedFiles.length > 0 &&
    changedFiles.every((f) => LOW_RISK_PATTERNS.some((p) => p.test(f)));

  if (isAllLowRisk) {
    return llmRisk === "high" ? "high" : llmRisk === "medium" ? "medium" : "low";
  }

  // Default: trust LLM but clamp to medium if unknown
  return llmRisk || "medium";
}

// ─── Risk adjuster for confidence score ──────────────────────────────────────

export function getRiskAdjustment(risk: RiskLevel): number {
  switch (risk) {
    case "low":
      return 5;
    case "medium":
      return 0;
    case "high":
      return -15;
  }
}

// ─── Check if auto-PR is eligible ────────────────────────────────────────────

export function isAutoFixEligible(
  confidence: number,
  risk: RiskLevel,
  errorType?: string,
  threshold = Number(process.env.AI_CONFIDENCE_THRESHOLD || 85)
): boolean {
  // Safe, deterministic errors can be auto-fixed at a lower threshold of 60%
  const isSafeError = [
    "syntax_error",
    "dependency_missing",
    "config_error",
    "build_error",
    "env_missing"
  ].includes(errorType || "");

  const targetThreshold = isSafeError
    ? Math.min(60, threshold)
    : threshold;

  // For safe errors, we also accept medium risk if the change is in a source file
  const isRiskAccepted = risk === "low" || (isSafeError && risk === "medium");

  return confidence >= targetThreshold && isRiskAccepted;
}
