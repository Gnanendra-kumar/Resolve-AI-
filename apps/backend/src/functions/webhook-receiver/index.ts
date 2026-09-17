import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { Webhooks } from "@octokit/webhooks";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from "uuid";
import { dbPut, dbQuery, Tables } from "../../services/db/DynamoClient";
import { IncidentQueueMessage, GitHubWorkflowRunEvent } from "@aiops/types";

const sqs = new SQSClient({ region: process.env.REGION || "us-east-1" });
const webhooks = new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET || "dummy-secret-for-local-dev" });

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    const body = event.body || "";
    const signature =
      event.headers["x-hub-signature-256"] ||
      event.headers["X-Hub-Signature-256"] ||
      "";
    const eventType =
      event.headers["x-github-event"] ||
      event.headers["X-GitHub-Event"] ||
      "";

    // ── HMAC Signature Verification ───────────────────────────────────────
    let isValid = false;
    if (process.env.MOCK_DB === "true" || !process.env.GITHUB_WEBHOOK_SECRET) {
      console.log("[WebhookReceiver][MOCK] Bypassing webhook signature verification");
      isValid = true;
    } else {
      isValid = await webhooks.verify(body, signature);
    }
    if (!isValid) {
      console.warn("[WebhookReceiver] Invalid webhook signature");
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid signature" }) };
    }

    const payload = JSON.parse(body);

    // ── Only process workflow_run failures ────────────────────────────────
    if (eventType !== "workflow_run" || payload.action !== "completed") {
      return { statusCode: 200, body: JSON.stringify({ message: "Ignored" }) };
    }

    const workflowEvent = payload as GitHubWorkflowRunEvent;
    const { workflow_run, repository } = workflowEvent;

    if (workflow_run.conclusion !== "failure") {
      return { statusCode: 200, body: JSON.stringify({ message: "Not a failure" }) };
    }

    console.log(
      `[WebhookReceiver] Failure detected: ${repository.full_name} / ${workflow_run.name} (run #${workflow_run.id})`
    );

    // ── Check if repo is being monitored ──────────────────────────────────
    const repos = await dbQuery(
      Tables.REPOS,
      "byGithubId",
      "githubId = :gid",
      { ":gid": repository.id }
    );

    if (repos.length === 0) {
      console.log(`[WebhookReceiver] Repo ${repository.full_name} not monitored, skipping`);
      return { statusCode: 200, body: JSON.stringify({ message: "Repo not monitored" }) };
    }

    const repo = repos[0] as any;

    // ── Create incident record in DynamoDB ────────────────────────────────
    const incidentId = uuidv4();
    const now = new Date().toISOString();

    await dbPut(Tables.INCIDENTS, {
      id: incidentId,
      repositoryId: repo.id,
      repositoryName: repository.full_name,
      workflowRunId: String(workflow_run.id),
      workflowName: workflow_run.name,
      title: `${workflow_run.name} failed on ${workflow_run.head_branch}`,
      status: "open",
      severity: "medium",
      createdAt: now,
      updatedAt: now,
    });

    // ── Enqueue for async AI processing ──────────────────────────────────
    const message: IncidentQueueMessage = {
      type: "workflow_failure",
      incidentId,
      repositoryId: repo.id,
      workflowRunId: String(workflow_run.id),
      timestamp: now,
    };

    if (process.env.MOCK_DB === "true" || !process.env.INCIDENT_QUEUE_URL) {
      console.log(`[WebhookReceiver][MOCK] Bypassing SQS queue. Directly invoking incident processor.`);
      const { handler: processHandler } = require("../incident-processor/index");
      const mockSqsEvent = {
        Records: [
          {
            messageId: "mock-msg-id",
            body: JSON.stringify(message),
            receiptHandle: "mock-receipt",
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: "mock-md5",
            eventSource: "aws:sqs",
            eventSourceARN: "mock-arn",
            awsRegion: "us-east-1"
          }
        ]
      };
      processHandler(mockSqsEvent).catch((err: any) => {
        console.error("[WebhookReceiver][MOCK] Incident processing failed:", err);
      });
    } else {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: process.env.INCIDENT_QUEUE_URL!,
          MessageBody: JSON.stringify(message),
          MessageGroupId: repo.id, // group by repo for ordering (if FIFO needed)
        })
      );
    }

    console.log(`[WebhookReceiver] Incident ${incidentId} created and queued`);

    return {
      statusCode: 200,
      body: JSON.stringify({ incidentId, queued: true }),
    };
  } catch (err) {
    console.error("[WebhookReceiver] Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
