import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { Github, Mail } from "lucide-react";

interface ShellProps {
  children: ReactNode;
}

export default function Shell({ children }: ShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)] p-2">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pl-2">
        <div className="flex-1 flex flex-col bg-white rounded-[2rem] overflow-hidden shadow-sm border border-slate-200 min-h-0">
          <Topbar />
          <main className="flex-1 overflow-y-auto px-12 pb-6 pt-4 animate-fade-in bg-white flex flex-col">
            <div className="flex-1">
              {children}
            </div>
            
            <footer className="mt-12 py-6 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 text-slate-500 text-sm">
              <div className="flex items-center gap-5">
                <a 
                  href="https://github.com/22je0249/ai-incident-support" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-teal-600 transition-colors"
                  title="GitHub Repository"
                >
                  <Github className="w-5 h-5" />
                </a>
                <a 
                  href="mailto:bheemunipavankumar93@gmail.com"
                  className="text-slate-400 hover:text-teal-600 transition-colors"
                  title="Email Support"
                >
                  <Mail className="w-5 h-5" />
                </a>
              </div>
              <div className="font-medium">
                © {new Date().getFullYear()} Resolve AI
              </div>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
