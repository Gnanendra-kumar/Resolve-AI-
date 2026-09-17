import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import * as crypto from "crypto";
import { dbGet, dbUpdate, dbPut, Tables } from "../../services/db/DynamoClient";
import { upsertEmbedding, incrementSuccessCount } from "../../services/knowledge/VectorStore";
import { embedText } from "../../services/ai/GroqService";
import { Incident, Feedback } from "@aiops/types";
import { v4 as uuidv4 } from "uuid";

/**
 * Handles one-click approve/reject links from email notifications.
 * Token format: base64url(incidentId:action:timestamp:hmac)
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const token = event.pathParameters?.token || "";

  if (!token) {
    return redirect(`${process.env.FRONTEND_URL}/incidents?error=invalid_token`);
  }

  // ── Verify and decode token ───────────────────────────────────────────────
  let incidentId: string;
  let action: "approved" | "rejected";

  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length < 4) throw new Error("Invalid token format");

    const [id, act, timestamp, hash] = parts;
    const payload = `${id}:${act}:${timestamp}`;
    const expectedHash = crypto
      .createHmac("sha256", process.env.JWT_SECRET!)
      .update(payload)
      .digest("hex");

    if (hash !== expectedHash) throw new Error("Invalid HMAC");

    // Token valid for 72 hours
    const tokenAge = Date.now() - Number(timestamp);
    if (tokenAge > 72 * 60 * 60 * 1000) throw new Error("Token expired");

    incidentId = id;
    action = act as "approved" | "rejected";
  } catch (err) {
    console.error("[FeedbackHandler] Token verification failed:", err);
    return redirect(`${process.env.FRONTEND_URL}/incidents?error=invalid_token`);
  }

  // ── Load incident ─────────────────────────────────────────────────────────
  const incident = await dbGet<Incident>(Tables.INCIDENTS, { id: incidentId });
  if (!incident) {
    return redirect(`${process.env.FRONTEND_URL}/incidents?error=not_found`);
  }

  // ── Record feedback ───────────────────────────────────────────────────────
  const feedbackId = uuidv4();
  const now = new Date().toISOString();

  await dbPut(Tables.FEEDBACK, {
    id: feedbackId,
    incidentId,
    action,
    aiSuggestion: incident.aiDiagnosis?.resolution,
    source: "email_link",
    createdAt: now,
  });

  // ── Update incident status ────────────────────────────────────────────────
  const newStatus = action === "approved" ? "resolved" : "rejected";
  await dbUpdate(Tables.INCIDENTS, { id: incidentId }, {
    status: newStatus,
    resolution: action === "approved" ? incident.aiDiagnosis?.resolution : undefined,
    resolvedAt: now,
    updatedAt: now,
  });

  // ── If approved: store in knowledge base ──────────────────────────────────
  if (action === "approved" && incident.aiDiagnosis) {
    try {
      const content = `Root Cause: ${incident.aiDiagnosis.rootCause}\nResolution: ${incident.aiDiagnosis.resolution}`;
      const embedding = await embedText(content);

      const vectorId = await upsertEmbedding(
        incidentId,
        content,
        embedding,
        {
          title: incident.title,
          rootCause: incident.aiDiagnosis.rootCause,
          resolution: incident.aiDiagnosis.resolution,
          technology: [],
          successCount: 1,
        }
      );

      // Also update knowledge table in DynamoDB
      await dbPut(Tables.KNOWLEDGE, {
        id: uuidv4(),
        incidentId,
        title: incident.title,
        rootCause: incident.aiDiagnosis.rootCause,
        resolution: incident.aiDiagnosis.resolution,
        errorType: incident.aiDiagnosis.errorType,
        verified: true,
        successCount: 1,
        totalUsage: 1,
        supabaseVectorId: vectorId,
        createdAt: now,
        updatedAt: now,
      });

      console.log(`[FeedbackHandler] Knowledge base updated for incident ${incidentId}`);
    } catch (err) {
      console.error("[FeedbackHandler] Failed to update knowledge base:", err);
    }
  }

  console.log(`[FeedbackHandler] Incident ${incidentId} marked as ${newStatus}`);

  // ── Redirect to dashboard ─────────────────────────────────────────────────
  return redirect(
    `${process.env.FRONTEND_URL}/incidents/${incidentId}?feedback=${action}`
  );
};

function redirect(url: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 302,
    headers: { Location: url },
    body: "",
  };
}
