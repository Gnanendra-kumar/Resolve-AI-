import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import {
  AlertTriangle, CheckCircle, Zap, Database, GitPullRequest,
  TrendingUp, Shield, Brain, ArrowUpRight, Clock
} from "lucide-react";
import { dashboardApi, incidentsApi } from "../api/client";
import { DashboardStats, Incident } from "@aiops/types";
import { format, parseISO } from "date-fns";

// ── Badge helpers ─────────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  const classes = {
    low: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    medium: "bg-amber-100 text-amber-700 border border-amber-200",
    high: "bg-red-100 text-red-700 border border-red-200",
    critical: "bg-rose-100 text-rose-700 border border-rose-200",
  }[s] || "bg-slate-100 text-slate-700 border border-slate-200";

  return <span className={`badge ${classes} capitalize`}>{s}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    open: "Open",
    analyzing: "Analyzing…",
    resolved: "Resolved",
    rejected: "Rejected",
    pr_created: "PR Created",
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

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, color, trend,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color: string; trend?: number;
}) {
  return (
    <div className="stat-card animate-fade-in">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            <ArrowUpRight className={`w-3 h-3 ${trend < 0 ? "rotate-180" : ""}`} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
      <div className="text-sm text-slate-500 font-medium">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

// ── Confidence Meter ──────────────────────────────────────────────────────────
function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 85 ? "#10b981" : value >= 65 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-3">
      <div className="confidence-bar flex-1">
        <div
          className="confidence-fill"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="text-sm font-semibold" style={{ color }}>{value}%</span>
    </div>
  );
}

// ── Tooltips ──────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass rounded-lg p-3 text-xs shadow-xl border border-slate-200">
        <p className="text-slate-500 mb-2">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="font-medium">
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function DashboardPage() {
  const { data: statsData, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: dashboardApi.stats,
    refetchInterval: 30_000,
  });

  const stats: DashboardStats | undefined = statsData?.data;

  const SEVERITY_COLORS = {
    low: "#10b981", medium: "#f59e0b", high: "#ef4444", critical: "#dc2626",
  };

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-32 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ──────────────────────────────────────────────────── */}


      {/* ── KPI Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={AlertTriangle}
          label="Total Incidents"
          value={stats.totalIncidents}
          sub={`${stats.openIncidents} currently open`}
          color="bg-amber-500/15 text-amber-400"
          trend={5}
        />
        <StatCard
          icon={CheckCircle}
          label="Auto-Resolved"
          value={stats.autoResolved}
          sub={`${stats.autoResolutionRate}% auto-resolution rate`}
          color="bg-emerald-500/15 text-emerald-400"
          trend={12}
        />
        <StatCard
          icon={Brain}
          label="AI Accuracy"
          value={`${stats.aiAccuracy}%`}
          sub={`Avg confidence: ${stats.avgConfidence}%`}
          color="bg-purple-500/15 text-purple-400"
          trend={3}
        />
        <StatCard
          icon={Database}
          label="Knowledge Base"
          value={stats.knowledgeBaseSize}
          sub={`${stats.prsCreated} PRs auto-created`}
          color="bg-blue-500/15 text-blue-400"
        />
      </div>

      {/* ── Secondary KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={GitPullRequest}
          label="PRs Created"
          value={stats.prsCreated}
          color="bg-violet-500/15 text-violet-400"
        />
        <StatCard
          icon={Shield}
          label="Repositories"
          value={stats.repositories}
          sub="being monitored"
          color="bg-cyan-500/15 text-cyan-400"
        />
        <StatCard
          icon={Clock}
          label="Resolved Today"
          value={stats.resolvedToday}
          color="bg-teal-500/15 text-teal-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Open Incidents"
          value={stats.openIncidents}
          color="bg-orange-500/15 text-orange-400"
        />
      </div>

      {/* ── Charts Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Weekly Trend — large */}
        <div className="lg:col-span-8 card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900">Weekly Incident Trend</h3>
            <span className="badge badge-medium">Last 7 days</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats.weeklyTrend} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <defs>
                <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="resGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                tickFormatter={(d) => format(parseISO(d), "MMM d")}
              />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone" dataKey="incidents" name="Incidents"
                stroke="#8b5cf6" fill="url(#incGrad)" strokeWidth={2}
              />
              <Area
                type="monotone" dataKey="resolved" name="Resolved"
                stroke="#10b981" fill="url(#resGrad)" strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Severity Breakdown — pie */}
        <div className="lg:col-span-4 card">
          <h3 className="font-semibold text-slate-900 mb-6">Severity Distribution</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={stats.severityBreakdown.filter((s) => s.count > 0)}
                dataKey="count"
                nameKey="severity"
                cx="50%" cy="50%"
                outerRadius={65}
                innerRadius={40}
              >
                {stats.severityBreakdown.map((entry) => (
                  <Cell
                    key={entry.severity}
                    fill={SEVERITY_COLORS[entry.severity as keyof typeof SEVERITY_COLORS]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {stats.severityBreakdown.map((s) => (
              <div key={s.severity} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: SEVERITY_COLORS[s.severity as keyof typeof SEVERITY_COLORS] }}
                  />
                  <span className="text-slate-500 capitalize">{s.severity}</span>
                </div>
                <span className="text-slate-900 font-medium">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Confidence Chart + Recent Incidents ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Confidence distribution */}
        <div className="lg:col-span-5 card">
          <h3 className="font-semibold text-slate-900 mb-6">Confidence Distribution</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats.confidenceDistribution} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="range" stroke="#94a3b8" tick={{ fontSize: 10 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Incidents" radius={[4, 4, 0, 0]}>
                {stats.confidenceDistribution.map((entry, i) => {
                  const mid = parseInt(entry.range.split("-")[0]) + 10;
                  const color = mid >= 80 ? "#10b981" : mid >= 60 ? "#f59e0b" : "#ef4444";
                  return <Cell key={i} fill={color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-2">
              <span>Average AI Confidence</span>
              <span className="text-slate-900 font-medium">{stats.avgConfidence}%</span>
            </div>
            <ConfidenceMeter value={stats.avgConfidence} />
          </div>
        </div>

        {/* Recent Incidents */}
        <div className="lg:col-span-7 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Recent Incidents</h3>
            <a href="/incidents" className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
              View all →
            </a>
          </div>
          <div className="space-y-2">
            {stats.recentIncidents.slice(0, 6).map((incident) => (
              <a
                key={incident.id}
                href={`/incidents/${incident.id}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 hover:-translate-y-0.5 hover:shadow-sm border border-transparent hover:border-slate-200 transition-all duration-200 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 truncate font-medium">
                    {incident.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {incident.repositoryName} · {format(parseISO(incident.createdAt), "MMM d, HH:mm")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <SeverityBadge severity={incident.severity} />
                  <StatusBadge status={incident.status} />
                  {incident.confidence !== undefined && (
                    <span className="text-xs font-medium text-slate-500">
                      {incident.confidence}%
                    </span>
                  )}
                </div>
              </a>
            ))}
            {stats.recentIncidents.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                <p className="text-sm">No incidents — all systems operational! 🎉</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
