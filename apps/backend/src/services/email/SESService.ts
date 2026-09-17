import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { Incident, AIDiagnosis } from "@aiops/types";
import * as crypto from "crypto";

const ses = new SESClient({ region: process.env.REGION || "us-east-1" });

const FROM_EMAIL = process.env.SES_FROM_EMAIL!;
const ALERT_EMAIL = process.env.SES_ALERT_EMAIL!;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// ─── Generate a signed token for one-click email actions ─────────────────────

function generateActionToken(incidentId: string, action: "approved" | "rejected"): string {
  const payload = `${incidentId}:${action}:${Date.now()}`;
  const hash = crypto
    .createHmac("sha256", process.env.JWT_SECRET!)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}:${hash}`).toString("base64url");
}

// ─── Medium/High risk incident alert ─────────────────────────────────────────

export async function sendIncidentAlert(
  incident: Incident,
  diagnosis: AIDiagnosis
): Promise<void> {
  if (process.env.MOCK_DB === "true" || !FROM_EMAIL) {
    console.log(`[SESService][MOCK] Bypassing SES. Incident Alert email:
  To: ${ALERT_EMAIL}
  Incident: ${incident.title}
  Root Cause: ${diagnosis.rootCause}
  Resolution: ${diagnosis.resolution}`);
    return;
  }
  const approveToken = generateActionToken(incident.id, "approved");
  const rejectToken = generateActionToken(incident.id, "rejected");
  const approveUrl = `${FRONTEND_URL}/api/feedback/${approveToken}`;
  const rejectUrl = `${FRONTEND_URL}/api/feedback/${rejectToken}`;
  const dashboardUrl = `${FRONTEND_URL}/incidents/${incident.id}`;

  const riskEmoji = { low: "🟢", medium: "🟡", high: "🔴" }[diagnosis.riskLevel] || "⚪";
  const severityColors = { low: "#10b981", medium: "#f59e0b", high: "#ef4444", critical: "#dc2626" };

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f1a; color: #e2e8f0; margin: 0; padding: 0; }
  .container { max-width: 620px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px; text-align: center; }
  .header h1 { color: white; margin: 0; font-size: 24px; font-weight: 700; }
  .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px; }
  .content { padding: 32px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
  .meta-card { background: #16213e; border: 1px solid #2d2d4e; border-radius: 8px; padding: 16px; }
  .meta-card label { font-size: 11px; color: #8892a4; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta-card .value { font-size: 16px; font-weight: 600; color: #e2e8f0; margin-top: 4px; }
  .section { background: #16213e; border: 1px solid #2d2d4e; border-radius: 8px; padding: 20px; margin: 16px 0; }
  .section h3 { color: #a78bfa; margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
  .section p { color: #94a3b8; margin: 0; line-height: 1.6; }
  .actions { display: flex; gap: 12px; margin: 24px 0; }
  .btn { flex: 1; padding: 14px 20px; border-radius: 8px; text-decoration: none; text-align: center; font-weight: 600; font-size: 14px; display: block; }
  .btn-approve { background: #10b981; color: white; }
  .btn-reject { background: #374151; color: #9ca3af; border: 1px solid #4b5563; }
  .btn-dashboard { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
  .confidence-bar { background: #2d2d4e; border-radius: 4px; height: 8px; overflow: hidden; margin-top: 8px; }
  .confidence-fill { height: 100%; border-radius: 4px; background: ${diagnosis.confidence >= 85 ? "#10b981" : diagnosis.confidence >= 65 ? "#f59e0b" : "#ef4444"}; }
  .footer { background: #0f0f1a; padding: 20px 32px; text-align: center; color: #4b5563; font-size: 12px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🚨 Incident Detected</h1>
    <p>${incident.repositoryName || "Repository"} requires your review</p>
  </div>
  <div class="content">
    <div class="meta-grid">
      <div class="meta-card">
        <label>Risk Level</label>
        <div class="value">${riskEmoji} ${diagnosis.riskLevel.toUpperCase()}</div>
      </div>
      <div class="meta-card">
        <label>AI Confidence</label>
        <div class="value">${diagnosis.confidence}%</div>
        <div class="confidence-bar">
          <div class="confidence-fill" style="width: ${diagnosis.confidence}%"></div>
        </div>
      </div>
      <div class="meta-card">
        <label>Error Type</label>
        <div class="value" style="font-size: 13px;">${diagnosis.errorType?.replace(/_/g, " ")}</div>
      </div>
      <div class="meta-card">
        <label>Severity</label>
        <div class="value" style="color: ${severityColors[incident.severity] || "#e2e8f0"}">${incident.severity?.toUpperCase()}</div>
      </div>
    </div>

    <div class="section">
      <h3>🔍 Root Cause</h3>
      <p>${diagnosis.rootCause}</p>
    </div>

    <div class="section">
      <h3>🔧 Suggested Resolution</h3>
      <p>${diagnosis.resolution}</p>
    </div>

    <div class="actions">
      <a href="${approveUrl}" class="btn btn-approve">✅ Approve Fix</a>
      <a href="${rejectUrl}" class="btn btn-reject">❌ Reject</a>
    </div>

    <a href="${dashboardUrl}" class="btn btn-dashboard" style="display: block; text-align: center;">
      📊 View Full Details in Dashboard
    </a>
  </div>
  <div class="footer">
    <p>AI Incident Response Platform • AIOps Copilot</p>
    <p>Incident ID: ${incident.id} • ${new Date().toLocaleString()}</p>
  </div>
</div>
</body>
</html>`;

  const textBody = `
AIOPS INCIDENT ALERT
====================
Repository: ${incident.repositoryName}
Risk Level: ${diagnosis.riskLevel.toUpperCase()}
Confidence: ${diagnosis.confidence}%
Error Type: ${diagnosis.errorType}

ROOT CAUSE:
${diagnosis.rootCause}

SUGGESTED RESOLUTION:
${diagnosis.resolution}

ACTIONS:
Approve Fix: ${approveUrl}
Reject: ${rejectUrl}
View Dashboard: ${dashboardUrl}

---
AI Incident Response Platform | ${new Date().toISOString()}
`;

  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [ALERT_EMAIL] },
      Message: {
        Subject: {
          Data: `[AIOps] ${riskEmoji} Incident: ${incident.title?.slice(0, 60)} — ${incident.repositoryName}`,
          Charset: "UTF-8",
        },
        Body: {
          Html: { Data: htmlBody, Charset: "UTF-8" },
          Text: { Data: textBody, Charset: "UTF-8" },
        },
      },
    })
  );

  console.log(`[SESService] Alert email sent to ${ALERT_EMAIL}`);
}

// ─── Low-risk auto-PR notification ───────────────────────────────────────────

export async function sendPRCreatedEmail(
  incident: Incident,
  prUrl: string,
  confidence: number
): Promise<void> {
  if (process.env.MOCK_DB === "true" || !FROM_EMAIL) {
    console.log(`[SESService][MOCK] Bypassing SES. Auto-fix PR Email:
  To: ${ALERT_EMAIL}
  PR: ${prUrl}
  Confidence: ${confidence}%`);
    return;
  }
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f1a; color: #e2e8f0; margin: 0; padding: 0; }
  .container { max-width: 620px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; text-align: center; }
  .header h1 { color: white; margin: 0; font-size: 24px; }
  .content { padding: 32px; }
  .btn { display: block; padding: 16px 24px; border-radius: 8px; text-decoration: none; text-align: center; font-weight: 600; font-size: 15px; background: #10b981; color: white; margin: 24px 0; }
  .footer { background: #0f0f1a; padding: 20px; text-align: center; color: #4b5563; font-size: 12px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>✅ Auto-Fix PR Created</h1>
  </div>
  <div class="content">
    <p>The AI automatically created a Pull Request for a <strong>low-risk</strong> issue in <strong>${incident.repositoryName}</strong>.</p>
    <p><strong>AI Confidence:</strong> ${confidence}%</p>
    <p><strong>Issue:</strong> ${incident.title}</p>
    <a href="${prUrl}" class="btn">🔗 Review Pull Request on GitHub</a>
    <p style="color: #64748b; font-size: 13px;">Please review the changes before merging. The AI suggests this is safe to merge, but human review is always recommended.</p>
  </div>
  <div class="footer">AI Incident Response Platform | ${new Date().toISOString()}</div>
</div>
</body>
</html>`;

  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [ALERT_EMAIL] },
      Message: {
        Subject: { Data: `[AIOps] ✅ Auto-fix PR created — ${incident.repositoryName}`, Charset: "UTF-8" },
        Body: { Html: { Data: htmlBody, Charset: "UTF-8" } },
      },
    })
  );
}

// ─── Weekly digest email ──────────────────────────────────────────────────────

export async function sendWeeklyDigest(stats: {
  total: number;
  autoResolved: number;
  humanResolved: number;
  open: number;
  accuracy: number;
  topErrorType: string;
}): Promise<void> {
  if (process.env.MOCK_DB === "true" || !FROM_EMAIL) {
    console.log(`[SESService][MOCK] Bypassing SES. Weekly digest email:`, stats);
    return;
  }
  const weeklyEmail = process.env.SES_WEEKLY_EMAIL || ALERT_EMAIL;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: sans-serif; background: #0f0f1a; color: #e2e8f0; margin: 0; }
  .container { max-width: 620px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #667eea, #764ba2); padding: 32px; text-align: center; }
  .header h1 { color: white; margin: 0; }
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 24px; }
  .stat { background: #16213e; border-radius: 8px; padding: 16px; text-align: center; }
  .stat .num { font-size: 28px; font-weight: 700; color: #a78bfa; }
  .stat .label { font-size: 12px; color: #64748b; margin-top: 4px; }
  .footer { background: #0f0f1a; padding: 16px; text-align: center; color: #4b5563; font-size: 12px; }
</style></head>
<body>
<div class="container">
  <div class="header"><h1>📊 Weekly Reliability Report</h1></div>
  <div class="stat-grid">
    <div class="stat"><div class="num">${stats.total}</div><div class="label">Total Incidents</div></div>
    <div class="stat"><div class="num">${stats.autoResolved}</div><div class="label">Auto-Resolved</div></div>
    <div class="stat"><div class="num">${stats.humanResolved}</div><div class="label">Human-Resolved</div></div>
    <div class="stat"><div class="num">${stats.open}</div><div class="label">Still Open</div></div>
    <div class="stat"><div class="num">${stats.accuracy}%</div><div class="label">AI Accuracy</div></div>
    <div class="stat"><div class="num">${stats.topErrorType}</div><div class="label">Top Error Type</div></div>
  </div>
  <div class="footer">AI Incident Response Platform | Week of ${new Date().toLocaleDateString()}</div>
</div>
</body>
</html>`;

  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [weeklyEmail] },
      Message: {
        Subject: { Data: `[AIOps] Weekly Reliability Report — ${new Date().toLocaleDateString()}`, Charset: "UTF-8" },
        Body: { Html: { Data: htmlBody, Charset: "UTF-8" } },
      },
    })
  );
}
