import { ScheduledEvent } from "aws-lambda";
import { dbScan, dbUpdate, dbPut, Tables } from "../../services/db/DynamoClient";
import { upsertEmbedding } from "../../services/knowledge/VectorStore";
import { embedText } from "../../services/ai/GroqService";
import { v4 as uuidv4 } from "uuid";
// Email service temporarily disabled
// import { sendWeeklyDigest } from "../../services/email/SESService";
import { Incident, KnowledgeEntry } from "@aiops/types";

/**
 * Nightly learning job:
 * 1. Find all newly resolved incidents not yet in the knowledge base
 * 2. Generate embeddings and upsert to Supabase pgvector
 * 3. Send weekly digest if it's Sunday
 */
export const handler = async (event: ScheduledEvent): Promise<void> => {
  console.log("[LearningJob] Starting nightly learning job");

  // ── Find resolved incidents not yet embedded ──────────────────────────────
  const resolvedIncidents = await dbScan<Incident>(
    Tables.INCIDENTS,
    "#s = :status AND attribute_not_exists(embeddedAt)",
    { ":status": "resolved" },
    100,
    { "#s": "status" }
  );

  console.log(`[LearningJob] Found ${resolvedIncidents.length} resolved incidents to embed`);

  let successCount = 0;
  let failCount = 0;

  for (const incident of resolvedIncidents) {
    if (!incident.aiDiagnosis?.rootCause || !incident.resolution) continue;

    try {
      const content = [
        `Root Cause: ${incident.aiDiagnosis.rootCause}`,
        `Resolution: ${incident.resolution || incident.aiDiagnosis.resolution}`,
        `Error Type: ${incident.aiDiagnosis.errorType || "unknown"}`,
        `Repository: ${incident.repositoryName || ""}`,
      ].join("\n");

      const embedding = await embedText(content);

      const vectorId = await upsertEmbedding(incident.id, content, embedding, {
        title: incident.title,
        rootCause: incident.aiDiagnosis.rootCause,
        resolution: incident.resolution || incident.aiDiagnosis.resolution,
        technology: [],
        successCount: 1,
      });

      const now = new Date().toISOString();
      await dbPut(Tables.KNOWLEDGE, {
        id: uuidv4(),
        incidentId: incident.id,
        title: incident.title,
        rootCause: incident.aiDiagnosis.rootCause,
        resolution: incident.resolution || incident.aiDiagnosis.resolution,
        errorType: incident.aiDiagnosis.errorType || "unknown",
        verified: true,
        successCount: 1,
        totalUsage: 1,
        supabaseVectorId: vectorId,
        createdAt: now,
        updatedAt: now,
      });

      // Mark as embedded
      await dbUpdate(Tables.INCIDENTS, { id: incident.id }, {
        embeddedAt: now,
        updatedAt: now,
      });

      successCount++;

      // Rate limit: Groq free tier has limits
      await sleep(200);
    } catch (err) {
      console.error(`[LearningJob] Failed to embed incident ${incident.id}:`, err);
      failCount++;
    }
  }

  console.log(`[LearningJob] Embedding complete — success: ${successCount}, failed: ${failCount}`);

  // ── Weekly digest (every Sunday) — TEMPORARILY DISABLED ─────────────────
  // const today = new Date();
  // if (today.getDay() === 0) {
  //   await sendWeeklyDigestReport();
  // }

  console.log("[LearningJob] Complete");
};

// Email temporarily disabled
// async function sendWeeklyDigestReport(): Promise<void> {
//   try {
//     const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
//     const allIncidents = await dbScan<Incident>(Tables.INCIDENTS);
//     const weekIncidents = allIncidents.filter((i) => i.createdAt >= oneWeekAgo);
//     const autoResolved = weekIncidents.filter((i) => i.status === "resolved" && i.prUrl).length;
//     const humanResolved = weekIncidents.filter((i) => i.status === "resolved" && !i.prUrl).length;
//     const open = weekIncidents.filter((i) => i.status === "open" || i.status === "analyzing").length;
//     const total = weekIncidents.length;
//     const resolved = autoResolved + humanResolved;
//     const accuracy = total > 0 ? Math.round((resolved / total) * 100) : 0;
//     const errorTypes: Record<string, number> = {};
//     weekIncidents.forEach((i) => {
//       const et = i.aiDiagnosis?.errorType || "unknown";
//       errorTypes[et] = (errorTypes[et] || 0) + 1;
//     });
//     const topErrorType = Object.entries(errorTypes).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
//     await sendWeeklyDigest({ total, autoResolved, humanResolved, open, accuracy, topErrorType });
//     console.log("[LearningJob] Weekly digest sent");
//   } catch (err) {
//     console.error("[LearningJob] Failed to send weekly digest:", err);
//   }
// }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
