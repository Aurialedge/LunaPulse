import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The e2e suite runs the real backend in fallback mode (no Gemini key) on a fresh temporary database,
// plus its own Vite server, so it never touches the dev database or calls Gemini.
const API_PORT = 8001;
const WEB_PORT = 5174;
const python = process.platform === "win32" ? join(".venv", "Scripts", "python") : join(".venv", "bin", "python");
const database = join(tmpdir(), `lunapulse-e2e-${Date.now()}.db`).replaceAll("\\", "/");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // the tests share one backend database
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../backend",
      url: `http://localhost:${API_PORT}/api/v1/health`,
      env: { DATABASE_URL: `sqlite:///${database}`, GEMINI_API_KEY: "" },
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
