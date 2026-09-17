import { SQSEvent, SQSBatchResponse } from "aws-lambda";
import { dbGet, dbUpdate, Tables } from "../../services/db/DynamoClient";
import { getFailedJobLogs } from "../../services/github/LogDownloader";
import { runDiagnosticPipeline } from "../../services/ai/DiagnosticEngine";
import { createFixPR } from "../../services/github/PullRequestCreator";
// Email service temporarily disabled
// import { sendIncidentAlert, sendPRCreatedEmail } from "../../services/email/SESService";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { IncidentQueueMessage, Incident } from "@aiops/types";

const s3 = new S3Client({ region: process.env.REGION || "us-east-1" });

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const failures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const message: IncidentQueueMessage = JSON.parse(record.body);
      console.log(`[IncidentProcessor] Processing incident: ${message.incidentId}`);

      // ── Load incident from DynamoDB ───────────────────────────────────
      const incident = await dbGet<Incident>(Tables.INCIDENTS, { id: message.incidentId });
      if (!incident) {
        console.error(`[IncidentProcessor] Incident ${message.incidentId} not found`);
        continue;
      }

      // ── Load repository info ──────────────────────────────────────────
      const repo = await dbGet<any>(Tables.REPOS, { id: incident.repositoryId });
      if (!repo) {
        console.error(`[IncidentProcessor] Repo ${incident.repositoryId} not found`);
        continue;
      }

      // ── Mark as analyzing ─────────────────────────────────────────────
      await dbUpdate(Tables.INCIDENTS, { id: message.incidentId }, {
        status: "analyzing",
        updatedAt: new Date().toISOString(),
      });

      // ── Download workflow logs ────────────────────────────────────────
      let rawLogs = "No logs available";
      let s3Key: string | undefined;

      try {
        rawLogs = await getFailedJobLogs(
          repo.fullName,
          Number(incident.workflowRunId)
        );

        // Archive logs to S3
        s3Key = `logs/${new Date().toISOString().split("T")[0]}/${message.incidentId}.txt`;
        if (process.env.MOCK_DB === "true" || !process.env.LOGS_BUCKET) {
          console.log(`[IncidentProcessor][MOCK] Bypassing S3 log upload for key: ${s3Key}`);
        } else {
          await s3.send(
            new PutObjectCommand({
              Bucket: process.env.LOGS_BUCKET!,
              Key: s3Key,
              Body: rawLogs,
              ContentType: "text/plain",
            })
          );
        }
      } catch (logErr) {
        console.warn("[IncidentProcessor] Log download failed, using incident metadata as context:", logErr);
        // Build a context string from the incident metadata so the LLM has something useful
        rawLogs = [
          `CI/CD FAILURE CONTEXT (logs unavailable — using incident metadata):`,
          `Repository: ${repo.fullName}`,
          `Workflow: ${incident.workflowName || "Unknown"}`,
          `Branch: ${incident.title || "Unknown"}`,
          `Language: ${repo.language || "Unknown"}`,
          `Severity: ${incident.severity || "medium"}`,
          `Timestamp: ${incident.createdAt || new Date().toISOString()}`,
          `Workflow Run ID: ${incident.workflowRunId}`,
          ``,
          `Note: The actual workflow logs could not be downloaded. Please analyze the failure based on the`,
          `workflow name, branch, and repository context above. Provide your best diagnosis and resolution.`,
        ].join("\n");
      }

      // ── Update incident with log reference ────────────────────────────
      if (s3Key) {
        await dbUpdate(Tables.INCIDENTS, { id: message.incidentId }, {
          rawLogsS3Key: s3Key,
          updatedAt: new Date().toISOString(),
        });
      }

      // ── Run AI Diagnostic Pipeline ────────────────────────────────────
      const diagnosticResult = await runDiagnosticPipeline({
        incidentId: message.incidentId,
        rawLogs,
        repositoryName: repo.fullName,
        language: repo.language,
        branch: repo.defaultBranch || "main",
      });

      const { aiDiagnosis, confidence, riskLevel, shouldAutoFix } = diagnosticResult;

      // ── Auto-PR for low-risk, high-confidence issues ──────────────────
      if (shouldAutoFix && aiDiagnosis.fixDiff) {
        try {
          const prResult = await createFixPR(
            repo.fullName,
            message.incidentId,
            aiDiagnosis,
            aiDiagnosis.fixDiff
          );

          if (prResult) {
            await dbUpdate(Tables.INCIDENTS, { id: message.incidentId }, {
              status: "pr_created",
              prUrl: prResult.prUrl,
              updatedAt: new Date().toISOString(),
            });

            // Email temporarily disabled
            // const updatedIncident = await dbGet<Incident>(Tables.INCIDENTS, { id: message.incidentId });
            // if (updatedIncident) {
            //   await sendPRCreatedEmail(updatedIncident, prResult.prUrl, confidence);
            // }
            console.log(`[IncidentProcessor] PR created (email notification skipped): ${prResult.prUrl}`);
          }
        } catch (prErr) {
          console.error("[IncidentProcessor] PR creation failed:", prErr);
          // Email temporarily disabled — skipping alert email
          console.log(`[IncidentProcessor] PR creation failed, email alert skipped`);
        }
      }

      console.log(
        `[IncidentProcessor] ✅ Incident ${message.incidentId} processed — confidence: ${confidence}%, risk: ${riskLevel}`
      );
    } catch (err) {
      console.error(`[IncidentProcessor] Failed to process record ${record.messageId}:`, err);
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
};

// Email temporarily disabled
// async function sendAlertEmail(
//   incidentId: string,
//   aiDiagnosis: any,
//   repo: any
// ): Promise<void> {
//   const incident = await dbGet<Incident>(Tables.INCIDENTS, { id: incidentId });
//   if (incident) {
//     await sendIncidentAlert(incident, aiDiagnosis);
//   }
// }
