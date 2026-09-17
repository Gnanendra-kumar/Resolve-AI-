import express from "express";
import fs from "fs";
import path from "path";

// 1. Manually parse .env file
const envPath = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(envPath)) {
  console.log(`[local-dev] Loading environment variables from ${envPath}`);
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index > 0) {
      const key = trimmed.slice(0, index).trim();
      let val = trimmed.slice(index + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/\\n/g, "\n");
      }
      process.env[key] = val;
    }
  }
}

// 2. Set dev defaults if not present
process.env.MOCK_DB = "true"; // Enable mock DB/AI/GitHub mode for smooth local runs
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "super-secret-key-at-least-32-characters-long";
if (!process.env.FRONTEND_URL || process.env.FRONTEND_URL.includes("localhost:3000")) {
  process.env.FRONTEND_URL = "http://localhost:3002";
}

// 3. Import Express App
import { app } from "./functions/api-handler/index";

// 4. Mount GitHub Webhook Receiver
import { handler as webhookHandler } from "./functions/webhook-receiver/index";
app.post("/webhook/github", async (req, res) => {
  console.log(`[local-dev] Received POST request to /webhook/github`);
  try {
    const mockEvent = {
      body: JSON.stringify(req.body),
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v || ""])
      ),
      pathParameters: null,
      queryStringParameters: null,
      requestContext: {} as any,
      isBase64Encoded: false,
    } as any;
    const result = (await webhookHandler(mockEvent)) as any;
    res.status(result.statusCode).send(result.body);
  } catch (err) {
    console.error("[local-dev] Webhook receiver error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// 5. Mount Feedback Handler
import { handler as feedbackHandler } from "./functions/feedback-handler/index";
app.get("/api/feedback/:token", async (req, res) => {
  console.log(`[local-dev] Received one-click feedback token: ${req.params.token}`);
  try {
    const mockEvent = {
      pathParameters: { token: req.params.token },
      body: "",
      headers: {},
      queryStringParameters: null,
      requestContext: {} as any,
      isBase64Encoded: false,
    } as any;
    const result = (await feedbackHandler(mockEvent)) as any;
    if (result.statusCode === 302 && result.headers?.Location) {
      res.redirect(result.headers.Location);
    } else {
      res.status(result.statusCode).send(result.body);
    }
  } catch (err) {
    console.error("[local-dev] Feedback handler error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// 6. Add Helper test endpoint to trigger a mock incident from backend console/POST
app.post("/api/test/trigger-incident", async (req, res) => {
  console.log("[local-dev] Manual incident trigger endpoint hit");
  const { repoName = "acme-corp/api-gateway", workflowName = "Build & Test" } = req.body;
  const mockPayload = {
    action: "completed",
    workflow_run: {
      id: Math.floor(Math.random() * 1000000),
      name: workflowName,
      conclusion: "failure",
      head_branch: "main",
      html_url: `https://github.com/${repoName}/actions/runs/123`,
    },
    repository: {
      id: repoName === "acme-corp/api-gateway" ? 88888 : 99999,
      name: repoName.split("/")[1],
      full_name: repoName,
      owner: { login: repoName.split("/")[0] },
    },
  };

  try {
    const mockEvent = {
      body: JSON.stringify(mockPayload),
      headers: {
        "x-github-event": "workflow_run",
        "x-hub-signature-256": "mock-signature",
      },
      pathParameters: null,
      queryStringParameters: null,
      requestContext: {} as any,
      isBase64Encoded: false,
    } as any;
    const result = (await webhookHandler(mockEvent)) as any;
    res.status(result.statusCode).json({ success: true, result: JSON.parse(result.body || "{}") });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// 7. Listen on port 3001
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 AIOps Platform Backend running locally on port ${PORT}`);
  console.log(`   - REST API: http://localhost:${PORT}/api`);
  console.log(`   - Auth redirect: http://localhost:${PORT}/auth/github`);
  console.log(`   - Webhook endpoint: http://localhost:${PORT}/webhook/github`);
  console.log(`   - Mock DB enabled (saving to db-mock.json)`);
  console.log(`======================================================\n`);
});
