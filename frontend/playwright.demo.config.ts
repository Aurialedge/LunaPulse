import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Records the demo video (demo/demo.spec.ts → ../docs/demo/lunapulse-demo.webm) against its own backend and
// Vite server on a fresh temporary database, so the dev database is never touched.
// Template explanations by default; set DEMO_LLM=gemini to use the key in backend/.env instead.
const API_PORT = 8002;
const WEB_PORT = 5175;
const python = process.platform === "win32" ? join(".venv", "Scripts", "python") : join(".venv", "bin", "python");
const database = join(tmpdir(), `lunapulse-demo-${Date.now()}.db`).replaceAll("\\", "/");
const useGemini = process.env.DEMO_LLM === "gemini";

export default defineConfig({
  testDir: "./demo",
  workers: 1,
  timeout: 10 * 60_000,
  expect: { timeout: 60_000 }, // Gemini can take up to ~30 s per generation
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${WEB_PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../backend",
      url: `http://localhost:${API_PORT}/api/v1/health`,
      // Without GEMINI_API_KEY here the backend reads backend/.env
      env: { DATABASE_URL: `sqlite:///${database}`, ...(useGemini ? {} : { GEMINI_API_KEY: "" }) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { LUNAPULSE_API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
