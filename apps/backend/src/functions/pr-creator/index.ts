import { Handler } from "aws-lambda";
import { createFixPR } from "../../services/github/PullRequestCreator";
import { AIDiagnosis } from "@aiops/types";

/**
 * Standalone Lambda for PR creation.
 * Can be invoked directly via Lambda.invoke() from other functions.
 */
export interface PRCreatorEvent {
  repoFullName: string;
  incidentId: string;
  diagnosis: AIDiagnosis;
  fixDiff: string;
}

export const handler: Handler<PRCreatorEvent> = async (event) => {
  const { repoFullName, incidentId, diagnosis, fixDiff } = event;

  console.log(`[PRCreator] Received request for incident: ${incidentId}, repo: ${repoFullName}`);

  if (!repoFullName || !incidentId || !diagnosis || !fixDiff) {
    console.error("[PRCreator] Missing required fields in event payload");
    return { success: false, error: "Missing required fields" };
  }

  try {
    const result = await createFixPR(repoFullName, incidentId, diagnosis, fixDiff);

    if (!result) {
      console.log("[PRCreator] PR creation skipped (no valid diff or mock mode)");
      return { success: false, error: "PR creation skipped" };
    }

    console.log(`[PRCreator] ✅ PR created successfully: ${result.prUrl}`);
    return { success: true, ...result };
  } catch (err) {
    console.error("[PRCreator] PR creation failed:", err);
    return { success: false, error: String(err) };
  }
};
