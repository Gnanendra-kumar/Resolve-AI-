import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";

let appInstance: App | null = null;

function getApp(): App {
  if (!appInstance) {
    appInstance = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    });
  }
  return appInstance;
}

export async function getInstallationClient(installationId: number): Promise<Octokit> {
  if (process.env.MOCK_DB === "true" || !process.env.GITHUB_APP_ID) {
    return {} as unknown as Octokit;
  }
  // Create a proper @octokit/rest Octokit with installation auth
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID!,
      privateKey: (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      installationId,
    },
  });
  return octokit;
}

export async function getRepoClient(
  owner: string,
  repo: string
): Promise<Octokit> {
  if (process.env.MOCK_DB === "true" || !process.env.GITHUB_APP_ID) {
    console.log(`[GithubClient][MOCK] Bypassing Octokit client creation for ${owner}/${repo}`);
    return {
      rest: {
        actions: {
          downloadWorkflowRunLogs: async () => ({
            data: "Simulated log content for workflow run from mock repository."
          }),
          listJobsForWorkflowRun: async () => ({
            data: {
              jobs: [
                { id: 101, name: "Build & Test", conclusion: "failure" }
              ]
            }
          }),
          downloadJobLogsForWorkflowRun: async () => ({
            data: "Simulated failed job log content."
          })
        },
        repos: {
          get: async () => ({
            data: { name: repo, owner: { login: owner }, language: "TypeScript" }
          })
        }
      }
    } as unknown as Octokit;
  }

  const app = getApp();
  let installationCount = 0;
  const triedInstallations: string[] = [];

  for await (const { installation } of app.eachInstallation.iterator()) {
    installationCount++;
    const accountLogin = (installation as any).account?.login || "";
    triedInstallations.push(`installation #${installation.id} (account: ${accountLogin})`);

    // Match by account owner name
    if (accountLogin.toLowerCase() === owner.toLowerCase()) {
      console.log(`[GithubClient] Found installation #${installation.id} for owner ${owner} — creating REST client for ${owner}/${repo}`);
      // Create a proper @octokit/rest Octokit with installation auth
      // This gives us full .rest.actions, .rest.repos, etc.
      const octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: process.env.GITHUB_APP_ID!,
          privateKey: (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
          installationId: installation.id,
        },
      });
      return octokit;
    }
  }

  console.error(
    `[GithubClient] No installation found for ${owner}/${repo}. ` +
    `Checked ${installationCount} installation(s): [${triedInstallations.join(", ")}]. ` +
    `Ensure the GitHub App (ID: ${process.env.GITHUB_APP_ID}) is installed on the ${owner} account.`
  );
  throw new Error(`No installation found for ${owner}/${repo}`);
}

export function parseRepoFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
}
