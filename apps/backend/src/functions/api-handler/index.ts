import express, { Request, Response, NextFunction } from "express";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { dbGet, dbPut, dbUpdate, dbQuery, dbScan, Tables } from "../../services/db/DynamoClient";
import { v4 as uuidv4 } from "uuid";
import * as jwt from "jsonwebtoken";
import { Incident, Repository, KnowledgeEntry, User, DashboardStats } from "@aiops/types";

export const app = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestOrigin = req.headers.origin;
  let allowedOrigin = process.env.FRONTEND_URL || "*";

  if (requestOrigin && (requestOrigin.includes("localhost") || requestOrigin.includes("vercel.app") || requestOrigin === allowedOrigin)) {
    allowedOrigin = requestOrigin;
  }

  if (allowedOrigin !== "*" && allowedOrigin.endsWith("/")) {
    allowedOrigin = allowedOrigin.slice(0, -1);
  }
  
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ─── Auth Middleware ──────────────────────────────────────────────────────────

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    (req as any).user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), service: "ai-incident-platform" });
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────

app.get("/auth/github", (req: Request, res: Response) => {
  const returnTo = req.query.returnTo || req.headers.referer || process.env.FRONTEND_URL;
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64');

  if (process.env.MOCK_DB === "true" || !process.env.GITHUB_CLIENT_ID) {
    console.log("[Auth][MOCK] Bypassing GitHub login redirect. Redirecting to mock callback.");
    res.redirect(`/auth/github/callback?code=mock_code&state=${state}`);
    return;
  }
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email&state=${state}`;
  res.redirect(githubAuthUrl);
});

app.get("/auth/github/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: "Missing code" });

  let returnTo = process.env.FRONTEND_URL || "http://localhost:3000";
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state as string, 'base64').toString('utf8'));
      if (decoded.returnTo) {
        returnTo = decoded.returnTo;
      }
    } catch (e) {
      console.warn("Failed to parse state parameter", e);
    }
  }

  try {
    let githubUser: any;
    if (process.env.MOCK_DB === "true" || code === "mock_code") {
      githubUser = {
        id: 12345,
        login: "mock-sre",
        avatar_url: "https://github.com/identicons/mock-sre.png",
        email: "mock-sre@company.com"
      };
    } else {
      // Exchange code for access token
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const tokenData = await tokenResponse.json() as any;
      const accessToken = tokenData.access_token;

      // Get GitHub user
      const userResponse = await fetch("https://api.github.com/user", {
        headers: { Authorization: `token ${accessToken}` },
      });
      githubUser = await userResponse.json() as any;
    }

    // Upsert user in DynamoDB
    const existingUsers = await dbQuery<User>(
      Tables.USERS, "byGithubId", "githubId = :gid", { ":gid": githubUser.id }
    );

    let user: User;
    if (existingUsers.length > 0) {
      user = existingUsers[0];
      await dbUpdate(Tables.USERS, { id: user.id }, {
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
        updatedAt: new Date().toISOString(),
      });
    } else {
      user = {
        id: uuidv4(),
        githubId: githubUser.id,
        username: githubUser.login,
        email: githubUser.email || undefined,
        avatarUrl: githubUser.avatar_url,
        role: "engineer",
        createdAt: new Date().toISOString(),
      };
      await dbPut(Tables.USERS, { ...user, updatedAt: user.createdAt });
    }

    // Issue JWT
    const jwtToken = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" as const }
    );

    // Redirect to frontend with token
    const baseUrl = returnTo.replace(/\/$/, '');
    res.redirect(`${baseUrl}/auth/callback?token=${jwtToken}`);
  } catch (err) {
    console.error("[Auth] GitHub OAuth error:", err);
    const baseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, '');
    res.redirect(`${baseUrl}/auth/error`);
  }
});

// ─── Incidents ────────────────────────────────────────────────────────────────

app.get("/api/incidents", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, repoId, limit = "50" } = req.query;

    let incidents: Incident[];
    if (repoId) {
      incidents = await dbQuery<Incident>(
        Tables.INCIDENTS, "byRepo", "repositoryId = :rid",
        { ":rid": repoId }, undefined, Number(limit)
      );
    } else if (status) {
      incidents = await dbQuery<Incident>(
        Tables.INCIDENTS, "byStatus", "#s = :status",
        { ":status": status }, { "#s": "status" }, Number(limit)
      );
    } else {
      incidents = await dbScan<Incident>(Tables.INCIDENTS, undefined, undefined, Number(limit));
    }

    incidents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, data: incidents, total: incidents.length });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.get("/api/incidents/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const incident = await dbGet<Incident>(Tables.INCIDENTS, { id: req.params.id });
    if (!incident) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: incident });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.patch("/api/incidents/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, resolution, severity } = req.body;
    await dbUpdate(Tables.INCIDENTS, { id: req.params.id }, {
      status, resolution, severity,
      resolvedAt: status === "resolved" ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
    });
    res.json({ success: true, message: "Updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Approve AI Fix & Create PR ───────────────────────────────────────────────

app.post("/api/incidents/:id/approve-fix", authMiddleware, async (req: Request, res: Response) => {
  try {
    const incidentId = req.params.id;

    // 1. Load the incident
    const incident = await dbGet<Incident>(Tables.INCIDENTS, { id: incidentId });
    if (!incident) {
      return res.status(404).json({ success: false, error: "Incident not found" });
    }

    const diagnosis = incident.aiDiagnosis;
    if (!diagnosis) {
      return res.status(400).json({ success: false, error: "No AI diagnosis available for this incident" });
    }

    if (!diagnosis.fixDiff || diagnosis.fixDiff.trim().length < 10) {
      // No fixDiff available — just resolve the incident without creating a PR
      await dbUpdate(Tables.INCIDENTS, { id: incidentId }, {
        status: "resolved",
        resolution: diagnosis.resolution,
        resolvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return res.json({
        success: true,
        message: "Incident resolved (no code fix diff available to create PR)",
        prCreated: false,
      });
    }

    // 2. Load the repository
    const repo = await dbGet<any>(Tables.REPOS, { id: incident.repositoryId });
    if (!repo) {
      return res.status(404).json({ success: false, error: "Repository not found" });
    }

    // 3. Create the fix PR
    const { createFixPR } = require("../../services/github/PullRequestCreator");
    const prResult = await createFixPR(repo.fullName, incidentId, diagnosis, diagnosis.fixDiff);

    if (!prResult) {
      // PR creation was skipped (e.g. mock mode returned null or invalid diff)
      await dbUpdate(Tables.INCIDENTS, { id: incidentId }, {
        status: "resolved",
        resolution: diagnosis.resolution,
        resolvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return res.json({
        success: true,
        message: "Incident resolved (PR creation skipped)",
        prCreated: false,
      });
    }

    // 4. Update incident with PR info
    await dbUpdate(Tables.INCIDENTS, { id: incidentId }, {
      status: "pr_created",
      prUrl: prResult.prUrl,
      resolution: diagnosis.resolution,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[API] PR created for incident ${incidentId}: ${prResult.prUrl}`);

    return res.json({
      success: true,
      message: "Fix PR created successfully",
      prCreated: true,
      prUrl: prResult.prUrl,
      prNumber: prResult.prNumber,
      branchName: prResult.branchName,
    });
  } catch (err) {
    console.error(`[API] Approve-fix failed for incident ${req.params.id}:`, err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Repositories ─────────────────────────────────────────────────────────────

app.get("/api/repositories", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const repos = await dbScan<Repository>(Tables.REPOS);
    res.json({ success: true, data: repos, total: repos.length });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.post("/api/repositories", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { fullName, githubId, defaultBranch, language } = req.body;
    const now = new Date().toISOString();
    const repo: Repository = {
      id: uuidv4(),
      githubId,
      fullName,
      defaultBranch: defaultBranch || "main",
      language,
      monitored: true,
      createdAt: now,
      updatedAt: now,
    };
    await dbPut(Tables.REPOS, repo);
    res.status(201).json({ success: true, data: repo });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.delete("/api/repositories/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbUpdate(Tables.REPOS, { id: req.params.id }, {
      monitored: false,
      updatedAt: new Date().toISOString(),
    });
    res.json({ success: true, message: "Repository removed from monitoring" });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Knowledge Base ───────────────────────────────────────────────────────────

app.get("/api/knowledge", authMiddleware, async (req: Request, res: Response) => {
  try {
    const entries = await dbScan<KnowledgeEntry>(Tables.KNOWLEDGE, undefined, undefined, 100);
    entries.sort((a, b) => b.successCount - a.successCount);
    res.json({ success: true, data: entries, total: entries.length });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

app.get("/api/dashboard", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const [incidents, repos, knowledge] = await Promise.all([
      dbScan<Incident>(Tables.INCIDENTS),
      dbScan<Repository>(Tables.REPOS),
      dbScan<KnowledgeEntry>(Tables.KNOWLEDGE),
    ]);

    const today = new Date().toISOString().split("T")[0];
    const todayIncidents = incidents.filter((i) => i.createdAt.startsWith(today));

    const resolved = incidents.filter((i) => i.status === "resolved");
    const autoResolved = incidents.filter((i) => i.status === "resolved" && i.prUrl);
    const open = incidents.filter((i) => i.status === "open" || i.status === "analyzing");

    const totalWithConfidence = incidents.filter((i) => i.confidence !== undefined);
    const avgConfidence =
      totalWithConfidence.length > 0
        ? Math.round(
            totalWithConfidence.reduce((sum, i) => sum + (i.confidence || 0), 0) /
            totalWithConfidence.length
          )
        : 0;

    const autoResolutionRate =
      incidents.length > 0 ? Math.round((autoResolved.length / incidents.length) * 100) : 0;

    // Weekly trend (last 7 days)
    const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
      const dayIncidents = incidents.filter((inc) => inc.createdAt.startsWith(d));
      return {
        date: d,
        incidents: dayIncidents.length,
        resolved: dayIncidents.filter((inc) => inc.status === "resolved").length,
      };
    }).reverse();

    // Severity breakdown
    const severityBreakdown = (["low", "medium", "high", "critical"] as const).map(
      (severity) => ({ severity, count: incidents.filter((i) => i.severity === severity).length })
    );

    // Confidence distribution
    const confidenceDistribution = [
      { range: "0-20", count: incidents.filter((i) => (i.confidence || 0) < 20).length },
      { range: "20-40", count: incidents.filter((i) => (i.confidence || 0) >= 20 && (i.confidence || 0) < 40).length },
      { range: "40-60", count: incidents.filter((i) => (i.confidence || 0) >= 40 && (i.confidence || 0) < 60).length },
      { range: "60-80", count: incidents.filter((i) => (i.confidence || 0) >= 60 && (i.confidence || 0) < 80).length },
      { range: "80-100", count: incidents.filter((i) => (i.confidence || 0) >= 80).length },
    ];

    const stats: DashboardStats = {
      totalIncidents: incidents.length,
      openIncidents: open.length,
      resolvedToday: todayIncidents.filter((i) => i.status === "resolved").length,
      autoResolved: autoResolved.length,
      aiAccuracy: resolved.length > 0 ? Math.round((autoResolved.length / resolved.length) * 100) : 0,
      avgConfidence,
      autoResolutionRate,
      knowledgeBaseSize: knowledge.length,
      prsCreated: incidents.filter((i) => i.prUrl).length,
      repositories: repos.filter((r) => r.monitored).length,
      recentIncidents: incidents.slice(0, 10).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      severityBreakdown,
      weeklyTrend,
      confidenceDistribution,
    };

    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ─── Lambda Handler using serverless-http ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const serverlessHttp = require("serverless-http");
export const handler = serverlessHttp(app);
