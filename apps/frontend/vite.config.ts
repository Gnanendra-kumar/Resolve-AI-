import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@aiops/types": path.resolve(__dirname, "../../packages/types/src"),
    },
  },
  server: {
    port: 3002,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/auth/github": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
