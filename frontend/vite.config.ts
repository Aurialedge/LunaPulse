/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const backend = process.env.LUNAPULSE_API_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // The browser only talks to the Vite server; /api is forwarded to FastAPI, so no API key or CORS setup is needed.
  server: { port: 5173, proxy: { "/api": backend } },
  preview: { port: 4173, proxy: { "/api": backend } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"], // e2e/ is run by Playwright
    css: false,
  },
});
