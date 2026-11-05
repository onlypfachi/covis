import path from "node:path";
import { createWorkerServer } from "./server.js";

const dataDir = path.resolve(process.env.DATA_DIR ?? "../data");
const port = Number(process.env.AGENT_WORKER_PORT ?? 8790);
const fake = process.env.COVIS_FAKE_AGENT === "1";

if (!fake && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.warn("ANTHROPIC_API_KEY is not set; runs will fail unless Claude Code credentials are available. Set COVIS_FAKE_AGENT=1 for a stub agent.");
}

const server = createWorkerServer({
  worktreesRoot: path.join(dataDir, "worktrees"),
  model: process.env.AGENT_MODEL ?? "claude-opus-5-5",
  maxTurns: Number(process.env.AGENT_MAX_TURNS ?? 60),
  maxBudgetUsd: process.env.AGENT_MAX_BUDGET_USD ? Number(process.env.AGENT_MAX_BUDGET_USD) : undefined,
  timeoutMs: Number(process.env.AGENT_TIMEOUT_MS ?? 30 * 60 * 1000),
  fake,
});
// Bound to localhost: only the backend worker talks to this service.
server.listen(port, process.env.AGENT_WORKER_HOST ?? "127.0.0.1", () => {
  console.log(`agent-worker listening on :${port}${fake ? " (fake agent)" : ""}, worktrees under ${dataDir}/worktrees`);
});
