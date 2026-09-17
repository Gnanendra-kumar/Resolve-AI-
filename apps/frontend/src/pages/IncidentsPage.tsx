import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Search, Filter, RefreshCw, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { incidentsApi } from "../api/client";
import { Incident, IncidentStatus, Severity } from "@aiops/types";
import { format, parseISO, formatDistanceToNow } from "date-fns";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "analyzing", label: "Analyzing" },
  { value: "resolved", label: "Resolved" },
  { value: "pr_created", label: "PR Created" },
  { value: "rejected", label: "Rejected" },
];

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = severity.toLowerCase();
  const classes = {
    low: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    medium: "bg-amber-100 text-amber-700 border border-amber-200",
    high: "bg-red-100 text-red-700 border border-red-200",
    critical: "bg-rose-100 text-rose-700 border border-rose-200",
  }[s] || "bg-slate-100 text-slate-700 border border-slate-200";

  return <span className={`badge ${classes} capitalize`}>{s}</span>;
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  const labels: Record<string, string> = {
    open: "Open", analyzing: "Analyzing…", resolved: "Resolved",
    rejected: "Rejected", pr_created: "PR Created",
  };
  
  const s = status.toLowerCase();
  const classes = {
    open: "bg-blue-100 text-blue-700 border border-blue-200",
    analyzing: "bg-purple-100 text-purple-700 border border-purple-200",
    resolved: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    rejected: "bg-slate-100 text-slate-700 border border-slate-200",
    pr_created: "bg-violet-100 text-violet-700 border border-violet-200",
  }[s] || "bg-slate-100 text-slate-700 border border-slate-200";

  return <span className={`badge ${classes}`}>{labels[status] || status}</span>;
}

function ConfidenceBar({ value }: { value?: number }) {
  if (value === undefined) return <span className="text-slate-500 text-xs">N/A</span>;
  const color = value >= 85 ? "#10b981" : value >= 65 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-slate-200">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs font-medium" style={{ color }}>{value}%</span>
    </div>
  );
}

export default function IncidentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["incidents", statusFilter],
    queryFn: () => incidentsApi.list({ status: statusFilter || undefined }),
    refetchInterval: 30_000,
  });

  const incidents: Incident[] = data?.data || [];

  const filtered = incidents.filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.title?.toLowerCase().includes(q) ||
      i.repositoryName?.toLowerCase().includes(q) ||
      i.rootCause?.toLowerCase().includes(q) ||
      i.errorType?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-6 pb-8">


      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="card flex flex-col md:flex-row items-start md:items-center gap-4">
        <div className="relative w-full flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search incidents, repositories, error types…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 w-full"
            id="incident-search"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input flex-1 md:w-44"
            id="status-filter"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button onClick={() => refetch()} className="btn btn-secondary shrink-0">
            <RefreshCw className="w-4 h-4" />
            <span className="hidden md:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200">
                {["Incident", "Repository", "Severity", "Risk", "Status", "Confidence", "Time", ""].map((h) => (
                  <th key={h} className="table-cell text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
            {isLoading && [...Array(5)].map((_, i) => (
              <tr key={i}>
                {[...Array(8)].map((_, j) => (
                  <td key={j} className="table-cell">
                    <div className="skeleton h-4 rounded w-full" />
                  </td>
                ))}
              </tr>
            ))}
            {!isLoading && paginated.map((incident) => (
              <tr
                key={incident.id}
                className="table-row"
                onClick={() => navigate(`/incidents/${incident.id}`)}
              >
                <td className="table-cell max-w-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                      incident.severity === "high" || incident.severity === "critical"
                        ? "text-red-400"
                        : incident.severity === "medium"
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-slate-900 line-clamp-1">{incident.title}</p>
                      {incident.rootCause && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{incident.rootCause}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="table-cell">
                  <code className="text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 font-mono">{incident.repositoryName}</code>
                </td>
                <td className="table-cell">
                  <SeverityBadge severity={incident.severity} />
                </td>
                <td className="table-cell">
                  {incident.riskLevel ? (
                    <span className="badge bg-slate-100 text-slate-700 border border-slate-200 capitalize">{incident.riskLevel}</span>
                  ) : (
                    <span className="text-slate-500 text-xs">—</span>
                  )}
                </td>
                <td className="table-cell">
                  <StatusBadge status={incident.status} />
                </td>
                <td className="table-cell">
                  <ConfidenceBar value={incident.confidence} />
                </td>
                <td className="table-cell">
                  <span className="text-xs text-slate-500">
                    {formatDistanceToNow(parseISO(incident.createdAt), { addSuffix: true })}
                  </span>
                </td>
                <td className="table-cell">
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-purple-500" />
                </td>
              </tr>
            ))}
            {!isLoading && paginated.length === 0 && (
              <tr>
                <td colSpan={8} className="table-cell text-center py-16 text-slate-500">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                  <p className="text-sm">No incidents found</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        
        {/* Pagination Controls */}
        {!isLoading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-900">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium text-slate-900">{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}</span> of <span className="font-medium text-slate-900">{filtered.length}</span> results
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium text-slate-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
