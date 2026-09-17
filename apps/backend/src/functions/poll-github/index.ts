import { ScheduledEvent } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from "uuid";
import { dbScan, dbQuery, dbPut, Tables } from "../../services/db/DynamoClient";
import { getRepoClient, parseRepoFullName } from "../../services/github/GithubClient";
import { IncidentQueueMessage } from "@aiops/types";

const sqs = new SQSClient({ region: process.env.REGION || "us-east-1" });

/**
 * GitHub Polling Fallback — runs every 5 minutes.
 * Catches workflow failures that may have been missed by webhooks.
 * Skips runs that are already recorded as incidents in DynamoDB.
 */
export const handler = async (event: ScheduledEvent): Promise<void> => {
  console.log("[PollGithub] Starting GitHub polling fallback");

  if (process.env.MOCK_DB === "true" || !process.env.GITHUB_APP_ID) {
    console.log("[PollGithub][MOCK] Skipping poll — mock mode or no GitHub App configured");
    return;
  }

  // ── Load all monitored repos from DynamoDB ──────────────────────────────
  const repos = await dbScan<any>(Tables.REPOS);
  console.log(`[PollGithub] Checking ${repos.length} monitored repos`);

  const since = new Date(Date.now() - 6 * 60 * 1000).toISOString(); // last 6 min (overlap with 5min schedule)

  for (const repo of repos) {
    try {
      await checkRepoForFailures(repo, since);
    } catch (err) {
      console.error(`[PollGithub] Error checking repo ${repo.fullName}:`, err);
    }
  }

  console.log("[PollGithub] Polling complete");
};

async function checkRepoForFailures(repo: any, since: string): Promise<void> {
  const { owner, repo: repoName } = parseRepoFullName(repo.fullName);
  const octokit = await getRepoClient(owner, repoName);

  // ── Fetch recent workflow runs ─────────────────────────────────────────
  let runs: any[] = [];
  try {
    const response = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo: repoName,
      status: "failure",
      per_page: 10,
      created: `>=${since}`,
    });
    runs = response.data.workflow_runs || [];
  } catch (err) {
    console.warn(`[PollGithub] Could not list workflow runs for ${repo.fullName}:`, err);
    return;
  }

  for (const run of runs) {
    try {
      await processFailedRun(repo, run);
    } catch (err) {
      console.error(`[PollGithub] Failed to process run ${run.id} for ${repo.fullName}:`, err);
    }
  }
}

async function processFailedRun(repo: any, run: any): Promise<void> {
  const workflowRunId = String(run.id);

  // ── Check if this run is already an incident ───────────────────────────
  const existing = await dbQuery<any>(
    Tables.INCIDENTS,
    "byRepo",
    "repositoryId = :rid",
    { ":rid": repo.id }
  );

  const alreadyTracked = existing.some((i) => i.workflowRunId === workflowRunId);
  if (alreadyTracked) {
    console.log(`[PollGithub] Run ${workflowRunId} already tracked, skipping`);
    return;
  }

  // ── Create new incident ────────────────────────────────────────────────
  const incidentId = uuidv4();
  const now = new Date().toISOString();

  await dbPut(Tables.INCIDENTS, {
    id: incidentId,
    repositoryId: repo.id,
    repositoryName: repo.fullName,
    workflowRunId,
    workflowName: run.name || "Unknown workflow",
    title: `${run.name || "Workflow"} failed on ${run.head_branch}`,
    status: "open",
    severity: "medium",
    source: "polling",
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[PollGithub] Created incident ${incidentId} for run ${workflowRunId} (${repo.fullName})`);

  // ── Enqueue for AI processing ──────────────────────────────────────────
  const message: IncidentQueueMessage = {
    type: "workflow_failure",
    incidentId,
    repositoryId: repo.id,
    workflowRunId,
    timestamp: now,
  };

  if (!process.env.INCIDENT_QUEUE_URL) {
    console.warn("[PollGithub] No INCIDENT_QUEUE_URL set, skipping SQS enqueue");
    return;
  }

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.INCIDENT_QUEUE_URL!,
      MessageBody: JSON.stringify(message),
    })
  );

  console.log(`[PollGithub] Incident ${incidentId} enqueued for processing`);
}
