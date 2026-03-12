import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api/ea": {
        target: "https://environment.data.gov.uk",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ea/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("accept", "application/ld+json");
            proxyReq.setHeader("API-Version", "1");
          });
        },
      },
    },
  },
});
