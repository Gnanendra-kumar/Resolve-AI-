import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import Shell from "./components/layout/Shell";
import DashboardPage from "./pages/DashboardPage";
import IncidentsPage from "./pages/IncidentsPage";
import IncidentDetailPage from "./pages/IncidentDetailPage";
import KnowledgeBasePage from "./pages/KnowledgeBasePage";
import RepositoriesPage from "./pages/RepositoriesPage";
import LoginPage from "./pages/LoginPage";
function App() {
  const token = localStorage.getItem("aiops_token");

  useEffect(() => {
    if (sessionStorage.getItem("login_success")) {
      toast.success("Successfully logged in!");
      sessionStorage.removeItem("login_success");
    }
  }, []);

  // Store token from OAuth callback
  if (window.location.pathname === "/auth/callback") {
    const params = new URLSearchParams(window.location.search);
    const cbToken = params.get("token");
    if (cbToken) {
      localStorage.setItem("aiops_token", cbToken);
      sessionStorage.setItem("login_success", "true");
      window.location.href = "/";
      return null;
    }
  }

  if (!token) {
    return (
      <>
        <Toaster position="bottom-right" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    );
  }

  return (
    <>
      <Toaster position="bottom-right" />
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          <Route path="/knowledge" element={<KnowledgeBasePage />} />
          <Route path="/repositories" element={<RepositoriesPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Shell>
    </>
  );
}

export default App;
