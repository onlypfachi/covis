import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5187),
    strictPort: true,
    proxy: { "/graphql": process.env.API_URL ?? "http://localhost:8787" },
  },
});
