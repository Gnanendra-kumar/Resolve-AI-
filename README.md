# Resolve AI — Incident Response Platform

> A self-learning AI platform for automated CI/CD failure diagnosis and incident resolution.  
> **100% Free Tier** · Groq API · AWS Lambda · Supabase pgvector

---

## Features

| Feature | Description |
|---------|-------------|
| **Real-time Monitoring** | GitHub webhooks trigger instant analysis on workflow failures |
| **AI Diagnosis** | Groq `llama-3.3-70b-versatile` analyzes logs with RAG context |
| **Self-Learning KB** | Resolved incidents embed into Supabase pgvector, improving future accuracy |
| **Confidence Scoring** | Weighted formula: similarity + LLM confidence + historical success + risk |
| **Risk Classification** | Deterministic rule-engine classifies changes before LLM refinement |
| **Auto PR Creation** | Low-risk + ≥85% confidence → GitHub PR created automatically |
| **Dashboard** | React + Recharts dashboard with real-time KPIs, charts, incident table |

---

## How Resolve AI Works

### 1. Automated PR Creation & Error Resolution
When a CI/CD pipeline or workflow fails, Resolve AI intercepts the GitHub webhook and begins its diagnosis pipeline:
1. **Log Ingestion**: It fetches the raw build logs from GitHub and uploads them to S3 for processing.
2. **Diagnosis & Risk Assessment**: The Groq LLM analyzes the logs to identify the root cause. A deterministic engine classifies the risk (Low, Medium, High, Critical).
3. **Automated Fix**: If the risk is categorized as "Low" and the AI confidence score is above 85%, Resolve AI automatically generates a code fix.
4. **PR Generation**: Resolve AI creates a new branch, commits the fix, and opens a Pull Request on GitHub on behalf of the developer.
5. **Notification**: The incident is flagged on the real-time dashboard for engineer review or approval.

### 2. RAG System & Self-Learning Knowledge Base
Resolve AI gets smarter over time by leveraging Retrieval-Augmented Generation (RAG):
1. **Knowledge Extraction**: When an incident is resolved, the root cause and successful resolution are extracted.
2. **Embedding**: The Groq embeddings API (`nomic-embed-text-v1_5`) converts the incident data into dense vector embeddings.
3. **Vector Database**: These embeddings are stored securely in Supabase pgvector.
4. **Contextual Retrieval**: During future failures, Resolve AI searches the pgvector database for similar past incidents using cosine similarity.
5. **Augmented Prompting**: The historical context (how similar issues were fixed in the past) is injected into the LLM prompt, dramatically increasing the accuracy and confidence of the new diagnosis.

---

## Architecture

```
GitHub Webhook → API Gateway → Lambda (WebhookReceiver)
                                      ↓
                               SQS (IncidentQueue)
                                      ↓
                          Lambda (IncidentProcessor)
                          ├── GitHub Logs → S3
                          ├── Groq Embedding → Supabase pgvector search
                          ├── Groq LLM diagnosis (RAG)
                          ├── Confidence scoring + Risk classification
                          ├── Low risk + high confidence → GitHub PR
                          └── Medium/High risk → Dashboard alert
                                      ↓
                     Human clicks "Approve" in dashboard
                                      ↓
                     Lambda (FeedbackHandler) → DynamoDB + Supabase
                                      ↓
                     EventBridge (nightly) → Lambda (LearningJob)
                                      ↓
                              Updated Knowledge Base
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- AWS CLI configured (`aws configure`)
- [Serverless Framework](https://www.serverless.com/): `npm i -g serverless`
- Groq API key (free): https://console.groq.com
- Supabase project (free): https://supabase.com
- GitHub App created: https://github.com/settings/apps/new

### 1. Clone & Install

```bash
git clone https://github.com/your-org/ai-incident-platform.git
cd ai-incident-platform
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in all values in .env
```

### 3. Set Up Supabase pgvector

Run `infrastructure/supabase-setup.sql` in your Supabase SQL Editor.

### 4. Deploy Backend to AWS Lambda

```bash
cd apps/backend
npx serverless deploy --stage dev
# Note the API Gateway URL in the output
```

### 5. Configure GitHub Webhook

Use the `WebhookUrl` from the Serverless output:
```
https://xxxx.execute-api.us-east-1.amazonaws.com/webhook/github
```
Set the webhook in your GitHub App settings. Event: `Workflow runs`.

### 6. Deploy Frontend to Vercel

```bash
cd apps/frontend
VITE_API_URL=https://your-api-gateway-url/api npx vercel --prod
```

---

## Cost — $0/month

| Service | Free Tier |
|---------|-----------|
| AWS Lambda | 1M req/mo + 400K GB-sec |
| API Gateway (HTTP) | 1M calls/mo |
| DynamoDB | 25 GB storage |
| S3 | 5 GB storage |
| SQS | 1M req/mo |
| CloudWatch | 5 GB logs/mo |
| EventBridge | 1M events/mo |
| Groq API | Free tier (rate-limited) |
| Supabase | 500 MB DB, 2 GB bandwidth |
| Vercel | Unlimited hobby deploys |

---

## Confidence Formula

```
finalConfidence =
  (similarity_score  × 0.30) +   // pgvector cosine similarity
  (llm_confidence    × 0.35) +   // Groq JSON response
  (historical_success× 0.25) +   // successCount/totalUsage from DynamoDB
  (risk_adjustment   × 0.10)     // +5 low / 0 medium / -15 high

Auto-PR threshold: confidence ≥ 85 AND riskLevel = "low"
```

---

## Project Structure

```
ai-incident-platform/
├── apps/
│   ├── backend/              # Lambda functions + services
│   │   ├── src/
│   │   │   ├── functions/   # 7 Lambda handlers
│   │   │   └── services/    # AI, GitHub, DB
│   │   └── serverless.yml   # Full IaC (Lambda, DynamoDB, SQS, S3)
│   └── frontend/             # React + Vite + Tailwind dashboard
│       └── src/
│           ├── pages/       # Dashboard, Incidents, KB, Repos
│           └── components/  # Layout, UI components
├── packages/
│   └── types/               # Shared TypeScript interfaces
├── infrastructure/
│   └── supabase-setup.sql   # pgvector schema + match_knowledge RPC
└── .github/workflows/       # CI + Deploy GitHub Actions
```

---

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user with Lambda/DynamoDB/S3/SQS permissions |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key |
| `GROQ_API_KEY` | From https://console.groq.com |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase service role key |
| `GH_APP_ID` | GitHub App ID |
| `GH_APP_PRIVATE_KEY` | GitHub App private key (PEM) |
| `GH_WEBHOOK_SECRET` | Random string for webhook HMAC |
| `GH_CLIENT_ID` | GitHub OAuth App client ID |
| `GH_CLIENT_SECRET` | GitHub OAuth App client secret |
| `JWT_SECRET` | Random secret ≥32 chars |
| `FRONTEND_URL` | Vercel deployment URL |
| `API_GATEWAY_URL` | API Gateway base URL (from `sls deploy` output) |
| `VERCEL_TOKEN` | Vercel API token |
| `VERCEL_ORG_ID` | Vercel org ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |

---

## Local Development

```bash
# Backend (offline with serverless-offline)
cd apps/backend
npm run dev

# Frontend
cd apps/frontend
npm run dev

# Deploy to dev stage
cd apps/backend
npx serverless deploy --stage dev

# Invoke a Lambda locally
npx serverless invoke local -f learningJob
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Charts | Recharts |
| Backend | AWS Lambda (Node.js 20) + Express |
| IaC | Serverless Framework v3 |
| Queue | AWS SQS |
| Database | AWS DynamoDB (metadata) + Supabase pgvector (embeddings) |
| Storage | AWS S3 (build logs) |
| LLM | Groq llama-3.3-70b-versatile |
| Embeddings | Groq nomic-embed-text-v1_5 (768-dim) |
| Scheduler | AWS EventBridge |
| Auth | GitHub OAuth + JWT |
| CI/CD | GitHub Actions |
| Hosting | Vercel (frontend) |

---

## License

MIT
