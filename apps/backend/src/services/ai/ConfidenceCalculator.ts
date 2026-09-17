import { getRiskAdjustment } from "../incident/RiskClassifier";
import { RiskLevel } from "@aiops/types";

export interface ConfidenceInputs {
  similarityScore: number;   // 0–100 from vector search cosine similarity
  llmConfidence: number;     // 0–100 from Groq JSON response
  historicalSuccess: number; // 0–100 from successCount/totalUsage ratio
  riskLevel: RiskLevel;
}

/**
 * Weighted confidence formula:
 *   similarity:   30%  (how close to past solved incidents)
 *   llm:          35%  (model's self-reported confidence)
 *   historical:   25%  (track record of this resolution type)
 *   risk adjust:  10%  (penalty for high risk changes)
 */
export function computeConfidence(inputs: ConfidenceInputs): number {
  const { similarityScore, llmConfidence, historicalSuccess, riskLevel } = inputs;

  const riskAdjust = getRiskAdjustment(riskLevel);
  const base = 50; // baseline risk adjustment base

  const score =
    similarityScore * 0.30 +
    llmConfidence * 0.35 +
    historicalSuccess * 0.25 +
    (base + riskAdjust) * 0.10;

  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 90) return "Very High";
  if (confidence >= 75) return "High";
  if (confidence >= 60) return "Medium";
  if (confidence >= 40) return "Low";
  return "Very Low";
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 85) return "#10b981"; // green
  if (confidence >= 65) return "#f59e0b"; // amber
  return "#ef4444";                        // red
}
