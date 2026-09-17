import { useLocation } from "react-router-dom";
import { Bell, RefreshCw, Github, Menu } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../../api/client";
import { useLayoutStore } from "../../store/layoutStore";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/incidents": "Incidents",
  "/knowledge": "Knowledge Base",
  "/repositories": "Repositories",
  "/settings": "Settings",
};

export default function Topbar() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { setMobileMenuOpen } = useLayoutStore();

  const { data: statsData } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: dashboardApi.stats,
    refetchInterval: 30_000,
  });

  const stats = statsData?.data;

  const title =
    PAGE_TITLES[location.pathname] ||
    (location.pathname.startsWith("/incidents/") ? "Incident Detail" : "Resolve AI");

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
              Welcome back! Here's an overview of your systems.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className="hidden lg:block">{badge}</div>
        <button
          onClick={() => queryClient.invalidateQueries()}
          title="Refresh"
          className="text-slate-400 hover:text-teal-600 transition-colors p-2"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
        <button className="text-slate-400 hover:text-teal-600 transition-colors p-2 relative" title="Notifications">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <div className="hidden md:flex items-center gap-3 ml-2 md:ml-4 pl-2 md:pl-4 border-l border-slate-200">
          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 border border-slate-200">
            <Github className="w-5 h-5" />
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-semibold text-slate-900">github_user</p>
            <p className="text-xs text-slate-500">Connected to GitHub</p>
          </div>
        </div>
      </div>
    </header>
  );
}
