import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Brain, AlertTriangle, GitPullRequest, CheckCircle,
  XCircle, ExternalLink, Clock, Code2, Lightbulb, Shield, Loader2
} from "lucide-react";
import { incidentsApi } from "../api/client";
import { Incident, AIDiagnosis } from "@aiops/types";
import { format, parseISO } from "date-fns";

function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 85 ? "#10b981" : value >= 65 ? "#f59e0b" : "#ef4444";
  const label = value >= 85 ? "High Confidence" : value >= 65 ? "Medium Confidence" : "Low Confidence";
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">{label}</span>
        <span className="font-bold text-slate-900">{value}%</span>
      </div>
      <div className="confidence-bar">
        <div className="confidence-fill" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function DiffViewer({ diff }: { diff: string }) {
  if (!diff) return null;
  return (
    <div className="code-block max-h-64 overflow-auto">
      {diff.split("\n").map((line, i) => (
        <div
          key={i}
          className={`${line.startsWith("+") ? "diff-add" : line.startsWith("-") ? "diff-remove" : ""}`}
        >
          {line || " "}
        </div>
      ))}
    </div>
  );
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["incident", id],
    queryFn: () => incidentsApi.get(id!),
    refetchInterval: 15_000,
  });

  const [approveError, setApproveError] = useState<string | null>(null);

  const resolveMutation = useMutation({
    mutationFn: (data: { status: string; resolution?: string }) =>
      incidentsApi.update(id!, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["incident", id] }),
  });

  const approveFixMutation = useMutation({
    mutationFn: () => incidentsApi.approveFix(id!),
    onSuccess: (result) => {
      setApproveError(null);
      queryClient.invalidateQueries({ queryKey: ["incident", id] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || "Failed to create PR";
      setApproveError(msg);
    },
  });

  const incident: Incident | undefined = data?.data;
  const diagnosis: AIDiagnosis | undefined = incident?.aiDiagnosis;

  if (isLoading || !incident) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 animate-fade-in">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate(-1)} className="btn btn-ghost p-2 mt-1">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 leading-tight">{incident.title}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <code className="text-xs text-purple-600 font-mono bg-purple-500/10 px-2 py-1 rounded">
              {incident.repositoryName}
            </code>
            <span className={`badge badge-${incident.severity}`}>{incident.severity}</span>
            <span className={`badge badge-${incident.status}`}>
              {incident.status === "analyzing" ? "Analyzing…" : incident.status}
            </span>
            {incident.riskLevel && (
              <span className={`badge badge-${incident.riskLevel}`}>
                <Shield className="w-3 h-3" />
                {incident.riskLevel} risk
              </span>
            )}
            <span className="text-xs text-[#64748b]">
              <Clock className="w-3 h-3 inline mr-1" />
              {format(parseISO(incident.createdAt), "MMM d, yyyy HH:mm")}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* ── Left Column: AI Diagnosis ──────────────────────────────── */}
        <div className="col-span-8 space-y-4">
          {/* AI Diagnosis Panel */}
          {diagnosis ? (
            <div className="card card-glow space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
                <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">AI Diagnosis</h2>
                  <p className="text-xs text-slate-500">Powered by Groq llama-3.3-70b</p>
                </div>
                <div className="ml-auto">
                  <span className="badge badge-analyzing">
                    {diagnosis.errorType?.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              {/* Confidence */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Confidence Score
                </h3>
                <ConfidenceMeter value={diagnosis.confidence} />
              </div>

              {/* Root Cause */}
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Root Cause
                </h3>
                <p className="text-sm text-slate-800 leading-relaxed bg-slate-50 rounded-lg p-4 border border-slate-200">
                  {diagnosis.rootCause}
                </p>
              </div>

              {/* Resolution */}
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  <Lightbulb className="w-3.5 h-3.5 text-emerald-500" />
                  Suggested Resolution
                </h3>
                <p className="text-sm text-slate-800 leading-relaxed bg-emerald-500/5 rounded-lg p-4 border border-emerald-500/20">
                  {diagnosis.resolution}
                </p>
              </div>

              {/* Fix Diff */}
              {diagnosis.fixDiff && (
                <div>
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    <Code2 className="w-3.5 h-3.5 text-blue-500" />
                    Proposed Diff
                  </h3>
                  <DiffViewer diff={diagnosis.fixDiff} />
                </div>
              )}

              {/* Similar Incidents */}
              {diagnosis.similarIncidents && diagnosis.similarIncidents.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Similar Past Incidents
                  </h3>
                  <div className="space-y-2">
                    {diagnosis.similarIncidents.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="w-6 h-6 rounded-full bg-purple-500/10 flex items-center justify-center text-xs text-purple-600 font-bold shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-900 truncate">{s.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{s.resolution.slice(0, 80)}…</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-bold text-purple-600">{s.similarity}%</div>
                          <div className="text-[10px] text-slate-400">{s.successCount}× success</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card flex items-center justify-center py-16">
              <div className="text-center">
                <Brain className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">
                  {incident.status === "analyzing" ? "AI analysis in progress…" : "No AI diagnosis available"}
                </p>
                {incident.status === "analyzing" && (
                  <div className="mt-3 flex justify-center">
                    <div className="w-32 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full bg-purple-500 animate-pulse" style={{ width: "60%" }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Logs section */}
          {incident.rawLogsS3Key && (
            <div className="card">
              <h3 className="font-semibold text-slate-900 mb-3 text-sm">Build Logs</h3>
              <p className="text-xs text-slate-500">
                Archived at: <code className="text-purple-600">{incident.rawLogsS3Key}</code>
              </p>
            </div>
          )}
        </div>

        {/* ── Right Column: Actions & Meta ───────────────────────────── */}
        <div className="col-span-4 space-y-4">
          {/* Actions */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-slate-900 text-sm border-b border-slate-200 pb-3">
              Actions
            </h3>

            {incident.prUrl && (
              <a
                href={incident.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary w-full justify-center"
                id="view-pr-btn"
              >
                <GitPullRequest className="w-4 h-4" />
                View Pull Request
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {incident.status === "open" || incident.status === "analyzing" ? (
              <>
                <button
                  className="btn btn-success w-full justify-center"
                  id="approve-fix-btn"
                  onClick={() => {
                    setApproveError(null);
                    approveFixMutation.mutate();
                  }}
                  disabled={approveFixMutation.isPending || resolveMutation.isPending}
                >
                  {approveFixMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {approveFixMutation.isPending ? "Creating PR…" : "Approve AI Fix"}
                </button>
                {approveError && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <strong>Error:</strong> {approveError}
                  </div>
                )}
                <button
                  className="btn btn-secondary w-full justify-center"
                  id="reject-fix-btn"
                  onClick={() => resolveMutation.mutate({ status: "rejected" })}
                  disabled={resolveMutation.isPending || approveFixMutation.isPending}
                >
                  <XCircle className="w-4 h-4" />
                  Reject & Resolve Manually
                </button>
              </>
            ) : (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                incident.status === "resolved"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
              }`}>
                {incident.status === "resolved" ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                <span className="text-sm font-medium capitalize">{incident.status}</span>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="card space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm border-b border-slate-200 pb-3">
              Incident Details
            </h3>
            {[
              { label: "ID", value: incident.id.slice(0, 8) + "…", mono: true },
              { label: "Repository", value: incident.repositoryName, mono: true },
              { label: "Workflow", value: incident.workflowName },
              { label: "Run ID", value: incident.workflowRunId, mono: true },
              { label: "Created", value: format(parseISO(incident.createdAt), "MMM d, HH:mm:ss") },
              { label: "Resolved", value: incident.resolvedAt ? format(parseISO(incident.resolvedAt), "MMM d, HH:mm") : "—" },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-xs text-slate-500">{label}</span>
                <span className={`text-xs text-slate-900 font-medium text-right ${mono ? "font-mono text-purple-600" : ""}`}>
                  {value || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
