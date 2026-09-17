import { Github, Brain, Shield, Zap } from "lucide-react";

export default function LoginPage() {
  const handleGithubLogin = () => {
    const apiUrl = import.meta.env.VITE_API_URL || "";
    let targetUrl = apiUrl
      ? apiUrl.replace(/\/api$/, "/auth/github")
      : "http://localhost:3001/auth/github";
    
    targetUrl += `?returnTo=${encodeURIComponent(window.location.origin)}`;
    window.location.href = targetUrl;
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <img src="/logo.png" alt="Resolve AI Logo" className="w-20 h-20 mx-auto object-contain animate-glow mix-blend-multiply" />
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            Resolve<span className="text-teal-500"> AI</span>
          </h1>
          <p className="text-slate-500 mt-2 text-sm font-medium">AI Incident Response Platform</p>
        </div>

        {/* Card */}
        <div className="card shadow-xl shadow-teal-900/5 border-white/50 bg-white/80 backdrop-blur-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-2 text-center">Sign in</h2>
          <p className="text-sm text-slate-500 text-center mb-8">
            Connect with GitHub to start monitoring your repositories
          </p>

          <button
            onClick={handleGithubLogin}
            id="github-login-btn"
            className="btn btn-primary w-full justify-center py-3 text-base mb-6"
          >
            <Github className="w-5 h-5" />
            Continue with GitHub
          </button>

          {/* Feature list */}
          <div className="space-y-3 border-t border-slate-200 pt-6 mt-6">
            {[
              { icon: Brain, text: "AI-powered failure diagnosis with Groq", color: "text-purple-600 bg-purple-100" },
              { icon: Shield, text: "Risk-classified automatic fixes & PRs", color: "text-emerald-600 bg-emerald-100" },
              { icon: Zap, text: "Serverless — runs on AWS free tier", color: "text-amber-600 bg-amber-100" },
            ].map(({ icon: Icon, text, color }) => (
              <div key={text} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-sm text-slate-600 font-medium">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 font-medium">
          Powered by Groq · AWS Lambda · Amazon SES · Supabase
        </p>
      </div>
    </div>
  );
}
