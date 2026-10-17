import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, RefreshCw, Menu, User, LogOut, ChevronDown, AlertTriangle, CheckCircle } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { dashboardApi, incidentsApi } from "../../api/client";
import { useLayoutStore } from "../../store/layoutStore";
import { Incident } from "@aiops/types";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/incidents": "Incidents",
  "/knowledge": "Knowledge Base",
  "/repositories": "Repositories",
  "/settings": "Settings",
};

/** Decode JWT payload (no verification — frontend only) */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setMobileMenuOpen } = useLayoutStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // ── Get user info from JWT token ──────────────────────────────────────
  const userInfo = useMemo(() => {
    const token = localStorage.getItem("aiops_token");
    if (!token) return { username: "User", role: "engineer" };
    const payload = decodeJwtPayload(token);
    return {
      username: payload?.username || "User",
      role: payload?.role || "engineer",
    };
  }, []);

  // ── Close dropdowns on outside click ───────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: statsData } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: dashboardApi.stats,
    refetchInterval: 30_000,
  });

  // ── Fetch recent incidents for notifications ──────────────────────────
  const { data: incidentData } = useQuery({
    queryKey: ["incidents", ""],
    queryFn: () => incidentsApi.list({ limit: 10 }),
    refetchInterval: 30_000,
  });

  const recentIncidents: Incident[] = (incidentData?.data || []).slice(0, 5);
  const openCount = recentIncidents.filter(
    (i) => i.status === "open" || i.status === "analyzing"
  ).length;

  const stats = statsData?.data;

  const title =
    PAGE_TITLES[location.pathname] ||
    (location.pathname.startsWith("/incidents/") ? "Incident Detail" : "Resolve AI");

  // ── Badge per page ─────────────────────────────────────────────────────
  let badge = null;
  if (location.pathname === "/dashboard") {
    badge = (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 mr-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-semibold text-emerald-700">Monitoring Active</span>
      </div>
    );
  } else if (location.pathname === "/incidents" || location.pathname.startsWith("/incidents/")) {
    badge = (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 mr-2">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-xs font-semibold text-amber-700">{stats?.totalIncidents || 0} Incidents</span>
      </div>
    );
  } else if (location.pathname === "/knowledge") {
    badge = (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-200 mr-2">
        <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
        <span className="text-xs font-semibold text-purple-700">{stats?.knowledgeBaseSize || 0} Entries</span>
      </div>
    );
  } else if (location.pathname === "/repositories") {
    badge = (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 mr-2">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-xs font-semibold text-blue-700">{stats?.repositories || 0} Repositories</span>
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    toast.success("Data refreshed successfully");
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const handleLogout = () => {
    localStorage.removeItem("aiops_token");
    toast.success("Successfully logged out");
    window.location.href = "/login";
  };

  return (
    <header className="h-20 md:h-28 bg-white flex items-center justify-between px-6 md:px-12 shrink-0">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden p-2 -ml-2 text-slate-500 hover:text-teal-600 transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">{title}</h2>
          {location.pathname === "/dashboard" && (
            <p className="hidden md:block text-sm text-slate-500 mt-1">
              Welcome back, {userInfo.username}! Here's an overview of your systems.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className="hidden lg:block">{badge}</div>

        {/* ── Refresh Button ───────────────────────────────────────── */}
        <button
          onClick={handleRefresh}
          title="Refresh all data"
          className="text-slate-400 hover:text-teal-600 transition-colors p-2"
          id="refresh-btn"
        >
          <RefreshCw className={`w-5 h-5 transition-transform ${isRefreshing ? "animate-spin" : ""}`} />
        </button>

        {/* ── Notifications Dropdown ───────────────────────────────── */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfileMenu(false);
            }}
            className="text-slate-400 hover:text-teal-600 transition-colors p-2 relative"
            title="Notifications"
            id="notifications-btn"
          >
            <Bell className="w-5 h-5" />
            {openCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center">
                {openCount > 9 ? "9+" : openCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-fade-in">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                {openCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">
                    {openCount} active
                  </span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {recentIncidents.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No recent notifications</p>
                  </div>
                ) : (
                  recentIncidents.map((incident) => (
                    <button
                      key={incident.id}
                      onClick={() => {
                        navigate(`/incidents/${incident.id}`);
                        setShowNotifications(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          incident.status === "resolved" || incident.status === "pr_created"
                            ? "bg-emerald-100 text-emerald-600"
                            : incident.status === "analyzing"
                            ? "bg-purple-100 text-purple-600"
                            : "bg-amber-100 text-amber-600"
                        }`}>
                          {incident.status === "resolved" || incident.status === "pr_created" ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-900 truncate">{incident.title}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {incident.repositoryName} · {incident.status}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {recentIncidents.length > 0 && (
                <button
                  onClick={() => {
                    navigate("/incidents");
                    setShowNotifications(false);
                  }}
                  className="w-full px-4 py-2.5 text-xs font-medium text-teal-600 hover:bg-teal-50 transition-colors border-t border-slate-100 text-center"
                >
                  View all incidents
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── User Profile Dropdown ────────────────────────────────── */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => {
              setShowProfileMenu(!showProfileMenu);
              setShowNotifications(false);
            }}
            className="hidden md:flex items-center gap-3 ml-2 md:ml-4 pl-2 md:pl-4 border-l border-slate-200 hover:opacity-80 transition-opacity"
            id="profile-btn"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
              {userInfo.username.charAt(0).toUpperCase()}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-sm font-semibold text-slate-900">{userInfo.username}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 hidden lg:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-fade-in">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900">{userInfo.username}</p>
                <p className="text-xs text-slate-500 capitalize">{userInfo.role}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    navigate("/dashboard");
                    setShowProfileMenu(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  My Dashboard
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Log Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
