import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import fs from "fs";
import path from "path";

const client = new DynamoDBClient({
  region: process.env.REGION || "us-east-1",
});

export const dynamo = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const Tables = {
  INCIDENTS: process.env.INCIDENTS_TABLE || "aiops-incidents-dev",
  REPOS: process.env.REPOS_TABLE || "aiops-repos-dev",
  KNOWLEDGE: process.env.KNOWLEDGE_TABLE || "aiops-knowledge-dev",
  USERS: process.env.USERS_TABLE || "aiops-users-dev",
  FEEDBACK: process.env.FEEDBACK_TABLE || "aiops-feedback-dev",
};

const useMock = process.env.MOCK_DB === "true" || !process.env.INCIDENTS_TABLE;
const MOCK_DB_PATH = path.resolve(__dirname, "../../../db-mock.json");

function getMockTableName(table: string): string {
  if (table === Tables.INCIDENTS) return "incidents";
  if (table === Tables.REPOS) return "repos";
  if (table === Tables.KNOWLEDGE) return "knowledge";
  if (table === Tables.USERS) return "users";
  if (table === Tables.FEEDBACK) return "feedback";
  return table;
}

function readMockDb(): Record<string, any[]> {
  try {
    if (fs.existsSync(MOCK_DB_PATH)) {
      return JSON.parse(fs.readFileSync(MOCK_DB_PATH, "utf8"));
    }
  } catch (e) {
    console.error("Error reading mock db, resetting", e);
  }
  
  // Seed initial data
  const seed = {
    users: [
      {
        id: "mock-user-id",
        githubId: 12345,
        username: "mock-sre",
        avatarUrl: "https://github.com/identicons/mock-sre.png",
        role: "engineer",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    repos: [
      {
        id: "repo-1",
        githubId: 88888,
        fullName: "acme-corp/api-gateway",
        defaultBranch: "main",
        language: "TypeScript",
        monitored: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "repo-2",
        githubId: 99999,
        fullName: "acme-corp/payment-service",
        defaultBranch: "master",
        language: "Go",
        monitored: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    incidents: [
      {
        id: "inc-1",
        repositoryId: "repo-1",
        repositoryName: "acme-corp/api-gateway",
        workflowRunId: "999991",
        workflowName: "Build & Test",
        title: "Build & Test failed on main",
        status: "resolved",
        severity: "medium",
        errorType: "dependency_missing",
        rootCause: "Cannot find module '@nestjs/config' or its corresponding type declarations.",
        resolution: "Run npm install @nestjs/config --save and push package.json and package-lock.json changes.",
        confidence: 95,
        riskLevel: "low",
        prUrl: "https://github.com/acme-corp/api-gateway/pull/42",
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        resolvedAt: new Date(Date.now() - 3 * 86400000).toISOString()
      },
      {
        id: "inc-2",
        repositoryId: "repo-2",
        repositoryName: "acme-corp/payment-service",
        workflowRunId: "999992",
        workflowName: "Docker Build",
        title: "Docker Build failed on master",
        status: "open",
        severity: "high",
        errorType: "config_error",
        rootCause: "Dockerfile references base image golang:1.21-alpine which failed to pull due to registry rate limit.",
        resolution: "Configure registry auth credentials or switch to a local public-mirror base image.",
        confidence: 78,
        riskLevel: "medium",
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
      },
      {
        id: "inc-3",
        repositoryId: "repo-1",
        repositoryName: "acme-corp/api-gateway",
        workflowRunId: "999993",
        workflowName: "Deploy Staging",
        title: "Deploy Staging failed on main",
        status: "open",
        severity: "critical",
        errorType: "env_missing",
        rootCause: "Database connection string env var DATABASE_URL is not set or empty during server startup.",
        resolution: "Add the DATABASE_URL environment variable to the staging environment configuration in AWS Parameter Store.",
        confidence: 88,
        riskLevel: "high",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    knowledge: [
      {
        id: "kb-1",
        incidentId: "inc-1",
        title: "Missing NestJS Config dependency",
        rootCause: "Cannot find module '@nestjs/config'",
        resolution: "Run npm install @nestjs/config --save",
        technology: ["nestjs", "npm", "typescript"],
        errorPattern: "Cannot find module",
        verified: true,
        successCount: 3,
        createdAt: new Date().toISOString()
      }
    ],
    feedback: []
  };
  fs.writeFileSync(MOCK_DB_PATH, JSON.stringify(seed, null, 2), "utf8");
  return seed;
}

function writeMockDb(data: Record<string, any[]>) {
  fs.writeFileSync(MOCK_DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

// ─── Helper wrappers ─────────────────────────────────────────────────────────

export async function dbGet<T>(table: string, key: Record<string, string | number>): Promise<T | null> {
  if (useMock) {
    const db = readMockDb();
    const tName = getMockTableName(table);
    const items = db[tName] || [];
    const found = items.find((item: any) => item.id === key.id);
    return (found as T) || null;
  }
  const result = await dynamo.send(new GetCommand({ TableName: table, Key: key }));
  return (result.Item as T) || null;
}

export async function dbPut(table: string, item: object): Promise<void> {
  if (useMock) {
    const db = readMockDb();
    const tName = getMockTableName(table);
    db[tName] = db[tName] || [];
    const index = db[tName].findIndex((existing: any) => existing.id === (item as any).id);
    if (index >= 0) {
      db[tName][index] = { ...db[tName][index], ...item };
    } else {
      db[tName].push(item);
    }
    writeMockDb(db);
    return;
  }
  await dynamo.send(new PutCommand({ TableName: table, Item: item as Record<string, unknown> }));
}

export async function dbUpdate(
  table: string,
  key: Record<string, string | number>,
  updates: Record<string, unknown>
): Promise<void> {
  if (useMock) {
    const db = readMockDb();
    const tName = getMockTableName(table);
    const items = db[tName] || [];
    const index = items.findIndex((item: any) => item.id === key.id);
    if (index >= 0) {
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );
      items[index] = { ...items[index], ...cleanUpdates };
      db[tName] = items;
      writeMockDb(db);
    }
    return;
  }

  const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const expressionParts = entries.map(([k], i) => `#k${i} = :v${i}`);
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  entries.forEach(([k, v], i) => {
    names[`#k${i}`] = k;
    values[`:v${i}`] = v;
  });

  await dynamo.send(
    new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: `SET ${expressionParts.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

export async function dbQuery<T>(
  table: string,
  indexName: string,
  keyCondition: string,
  expressionValues: Record<string, unknown>,
  expressionNames?: Record<string, string>,
  limit?: number
): Promise<T[]> {
  if (useMock) {
    const db = readMockDb();
    const tName = getMockTableName(table);
    const items = db[tName] || [];
    let filtered = items.filter((item: any) => {
      if (indexName === "byRepo") {
        return item.repositoryId === expressionValues[":rid"];
      }
      if (indexName === "byStatus") {
        return item.status === expressionValues[":status"];
      }
      if (indexName === "byGithubId") {
        return Number(item.githubId) === Number(expressionValues[":gid"]);
      }
      if (indexName === "byIncident") {
        return item.incidentId === expressionValues[":incidentId"] || item.incidentId === expressionValues[":iid"];
      }
      return true;
    });
    if (limit) {
      filtered = filtered.slice(0, limit);
    }
    return filtered as T[];
  }

  const result = await dynamo.send(
    new QueryCommand({
      TableName: table,
      IndexName: indexName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return (result.Items as T[]) || [];
}

export async function dbScan<T>(
  table: string,
  filterExpression?: string,
  expressionValues?: Record<string, unknown>,
  limit?: number,
  expressionNames?: Record<string, string>
): Promise<T[]> {
  if (useMock) {
    const db = readMockDb();
    const tName = getMockTableName(table);
    let items = db[tName] || [];
    if (limit) {
      items = items.slice(0, limit);
    }
    return items as T[];
  }

  const result = await dynamo.send(
    new ScanCommand({
      TableName: table,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
      Limit: limit,
    })
  );
  return (result.Items as T[]) || [];
}
