import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import toast from "react-hot-toast";
import { useLayoutStore } from "../../store/layoutStore";
import ConfirmModal from "../ui/ConfirmModal";
import {
  LayoutDashboard, AlertTriangle, BookOpen, GitBranch,
  Settings, LogOut, PanelLeftClose, PanelLeftOpen, HelpCircle, X
} from "lucide-react";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/incidents", icon: AlertTriangle, label: "Incidents" },
  { to: "/knowledge", icon: BookOpen, label: "Knowledge Base" },
  { to: "/repositories", icon: GitBranch, label: "System Users" },
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { mobileMenuOpen, setMobileMenuOpen } = useLayoutStore();

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (!isCollapsed) {
      timeout = setTimeout(() => {
        setIsCollapsed(true);
      }, 5000);
    }
    return () => clearTimeout(timeout);
  }, [isCollapsed]);

  return (
    <>
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden" 
          onClick={() => setMobileMenuOpen(false)} 
        />
      )}
      <aside
        className={`${isCollapsed ? "w-20" : "w-72"
          } shrink-0 flex flex-col h-screen sticky top-0 transition-all duration-300 ease-in-out bg-[var(--bg-primary)] md:bg-transparent ${mobileMenuOpen ? "fixed left-0 z-50 shadow-2xl" : "hidden md:flex"}`}
      >
      {/* ── Logo & Toggle ────────────────────────────────────────── */}
      <div className="h-20 px-4 flex items-center justify-between border-b border-slate-200/50 mx-2">
        {!isCollapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <img src="/logo.png" alt="Resolve AI Logo" className="w-9 h-12 object-contain shrink-0" />
            <span className="text-2xl font-black text-slate-800 tracking-tight whitespace-nowrap">
              Resolve<span className="text-teal-500"> AI</span>
            </span>
          </div>
        )}
        <button
          onClick={() => {
            if (window.innerWidth < 768) {
              setMobileMenuOpen(false);
            } else {
              setIsCollapsed(!isCollapsed);
            }
          }}
          className={`p-2 rounded-lg text-slate-500 hover:bg-white hover:shadow-sm transition-all ${isCollapsed ? "mx-auto" : ""
            }`}
        >
          {window.innerWidth < 768 ? (
            <X className="w-5 h-5" />
          ) : isCollapsed ? (
            <PanelLeftOpen className="w-5 h-5" />
          ) : (
            <PanelLeftClose className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* ── Navigation ─────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-visible">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => {
              if (window.innerWidth < 768) setMobileMenuOpen(false);
            }}
            className={({ isActive }) =>
              `relative group flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-all duration-200 ${isActive
                ? "bg-teal-500 text-white shadow-md shadow-teal-500/20"
                : "text-slate-600 hover:bg-white hover:text-teal-600 hover:shadow-sm"
              } ${isCollapsed ? "justify-center" : ""}`
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            {!isCollapsed && <span className="flex-1 whitespace-nowrap">{label}</span>}
            
            {/* Custom Tooltip */}
            {isCollapsed && (
              <div className="absolute left-full ml-1 px-3 py-1.5 bg-teal-500 text-white text-sm font-semibold rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Footer Actions ─────────────────────────────────────────── */}
      <div className="px-3 py-6 space-y-2 border-t border-slate-200/50 mx-2">
        <button
          title={isCollapsed ? "Help" : undefined}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-slate-600 hover:bg-white hover:text-teal-600 hover:shadow-sm transition-all duration-200 ${isCollapsed ? "justify-center" : ""
            }`}
        >
          <HelpCircle className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span className="whitespace-nowrap">Help</span>}
        </button>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          title={isCollapsed ? "Logout" : undefined}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:shadow-sm transition-all duration-200 ${isCollapsed ? "justify-center" : ""
            }`}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span className="whitespace-nowrap">Logout</span>}
        </button>
      </div>
    </aside>

    <ConfirmModal
      isOpen={showLogoutConfirm}
      title="Log Out"
      message="Are you sure you want to log out?"
      confirmText="Log Out"
      isDestructive={true}
      onConfirm={() => {
        localStorage.removeItem("aiops_token");
        toast.success("Successfully logged out");
        window.location.href = "/login";
      }}
      onCancel={() => setShowLogoutConfirm(false)}
    />
    </>
  );
}
