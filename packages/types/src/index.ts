// ─── Enums ────────────────────────────────────────────────────────────────────

export type IncidentStatus = "open" | "analyzing" | "resolved" | "rejected" | "pr_created";
export type Severity = "low" | "medium" | "high" | "critical";
export type RiskLevel = "low" | "medium" | "high";
export type FeedbackAction = "approved" | "rejected" | "modified";
export type UserRole = "engineer" | "admin";

// ─── Repository ───────────────────────────────────────────────────────────────

export interface Repository {
  id: string;
  githubId: number;
  fullName: string;
  defaultBranch: string;
  language?: string;
  monitored: boolean;
  webhookId?: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Incident ─────────────────────────────────────────────────────────────────

export interface Incident {
  id: string;
  repositoryId: string;
  repositoryName?: string;
  workflowRunId?: string;
  workflowName?: string;
  title: string;
  status: IncidentStatus;
  severity: Severity;
  rootCause?: string;
  errorType?: string;
  rawLogsS3Key?: string;
  aiDiagnosis?: AIDiagnosis;
  confidence?: number;
  riskLevel?: RiskLevel;
  resolution?: string;
  prUrl?: string;
  assignedTo?: string;
  createdAt: string;
  resolvedAt?: string;
  updatedAt: string;
}

export interface AIDiagnosis {
  rootCause: string;
  resolution: string;
  fixDiff?: string;
  confidence: number;
  riskLevel: RiskLevel;
  errorType: string;
  similarIncidents?: SimilarIncident[];
  reasoning?: string;
}

export interface SimilarIncident {
  id: string;
  title: string;
  resolution: string;
  similarity: number;
  successCount: number;
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export interface KnowledgeEntry {
  id: string;
  incidentId?: string;
  title: string;
  rootCause: string;
  resolution: string;
  technology: string[];
  errorPattern?: string;
  errorType?: string;
  verified: boolean;
  successCount: number;
  totalUsage: number;
  supabaseVectorId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSearchResult extends KnowledgeEntry {
  similarity: number;
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export interface Feedback {
  id: string;
  incidentId: string;
  userId?: string;
  userEmail?: string;
  action: FeedbackAction;
  aiSuggestion?: string;
  humanResolution?: string;
  notes?: string;
  createdAt: string;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  githubId: number;
  username: string;
  email?: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
}

// ─── GitHub Webhook ───────────────────────────────────────────────────────────

export interface GitHubWorkflowRunEvent {
  action: "completed" | "in_progress" | "requested";
  workflow_run: {
    id: number;
    name: string;
    conclusion: "failure" | "success" | "cancelled" | "timed_out" | null;
    status: string;
    url: string;
    html_url: string;
    logs_url: string;
    head_branch: string;
    head_sha: string;
    run_number: number;
  };
  repository: {
    id: number;
    full_name: string;
    default_branch: string;
    language: string;
    private: boolean;
  };
  sender: {
    login: string;
    avatar_url: string;
  };
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface DashboardStats {
  totalIncidents: number;
  openIncidents: number;
  resolvedToday: number;
  autoResolved: number;
  aiAccuracy: number;
  avgConfidence: number;
  autoResolutionRate: number;
  knowledgeBaseSize: number;
  prsCreated: number;
  repositories: number;
  recentIncidents: Incident[];
  severityBreakdown: { severity: Severity; count: number }[];
  weeklyTrend: { date: string; incidents: number; resolved: number }[];
  confidenceDistribution: { range: string; count: number }[];
}

// ─── SQS Events ───────────────────────────────────────────────────────────────

export interface IncidentQueueMessage {
  type: "workflow_failure" | "manual_trigger" | "poll_detected";
  incidentId: string;
  repositoryId: string;
  workflowRunId?: string;
  logsUrl?: string;
  timestamp: string;
}
