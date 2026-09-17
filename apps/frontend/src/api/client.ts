import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// ── Auth interceptor ──────────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aiops_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("aiops_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// ── API methods ───────────────────────────────────────────────────────────────

export const incidentsApi = {
  list: (params?: { status?: string; repoId?: string; limit?: number }) =>
    api.get("/incidents", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/incidents/${id}`).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/incidents/${id}`, data).then((r) => r.data),
  approveFix: (id: string) =>
    api.post(`/incidents/${id}/approve-fix`).then((r) => r.data),
};

export const repositoriesApi = {
  list: () => api.get("/repositories").then((r) => r.data),
  add: (data: { fullName: string; githubId: number; defaultBranch?: string; language?: string }) =>
    api.post("/repositories", data).then((r) => r.data),
  remove: (id: string) => api.delete(`/repositories/${id}`).then((r) => r.data),
};

export const knowledgeApi = {
  list: () => api.get("/knowledge").then((r) => r.data),
};

export const dashboardApi = {
  stats: () => api.get("/dashboard").then((r) => r.data),
};
