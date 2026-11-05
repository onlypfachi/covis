import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { normalize } from "./events.js";
import { checkToolCall } from "./pathGuard.js";
import { buildPrompt, systemAppend } from "./prompt.js";
import type { RunRequest, WorkerEvent } from "./types.js";

/** File tools only. No Bash, network or subagents: tests run separately in a
 * network-less container, and git is owned by the backend. */
export const ALLOWED_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep"] as const;
const DENIED_TOOLS = ["Bash", "WebFetch", "WebSearch", "Task", "Agent", "NotebookEdit", "KillShell", "BashOutput"];

export interface RunOptions {
  signal: AbortSignal;
  model: string;
  maxTurns: number;
  maxBudgetUsd?: number;
  queryFn?: typeof query;
}

/** Only what the agent subprocess needs. Backend secrets such as GITHUB_TOKEN never reach it. */
function agentEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of ["PATH", "HOME", "LANG", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]) {
    const v = process.env[k];
    if (v) env[k] = v;
  }
  return env;
}

export function agentOptions(req: RunRequest, opts: RunOptions, onDenied: (e: WorkerEvent) => void): Options {
  const allowed = new Set<string>(ALLOWED_TOOLS);
  const abortController = new AbortController();
  opts.signal.addEventListener("abort", () => abortController.abort(), { once: true });
  return {
    cwd: req.worktreePath,
    model: opts.model,
    maxTurns: opts.maxTurns,
    maxBudgetUsd: opts.maxBudgetUsd,
    abortController,
    tools: [...ALLOWED_TOOLS],
    disallowedTools: DENIED_TOOLS,
    // Every call goes through canUseTool; nothing is pre-approved.
    permissionMode: "default",
    canUseTool: async (tool, input) => {
      const reason = checkToolCall(req.worktreePath, allowed, tool, input);
      if (reason) {
        onDenied({ type: "tool_denied", tool, reason });
        return { behavior: "deny", message: reason };
      }
      return { behavior: "allow", updatedInput: input };
    },
    // Isolation: do not load user settings or the (untrusted) repo's .claude settings.
    settingSources: [],
    persistSession: false,
    env: agentEnv(),
    systemPrompt: { type: "preset", preset: "claude_code", append: systemAppend(req) },
  };
}

/** Run the Claude Agent SDK against the worktree, yielding normalized events.
 * Always ends with exactly one "result" event. */
export async function* runAgent(req: RunRequest, opts: RunOptions): AsyncGenerator<WorkerEvent> {
  const pending: WorkerEvent[] = [];
  const q = (opts.queryFn ?? query)({
    prompt: buildPrompt(req),
    options: agentOptions(req, opts, (e) => pending.push(e)),
  });
  let sawResult = false;
  try {
    for await (const msg of q as AsyncIterable<SDKMessage>) {
      while (pending.length) yield pending.shift()!;
      for (const ev of normalize(msg)) {
        if (ev.type === "result") sawResult = true;
        yield ev;
      }
    }
    while (pending.length) yield pending.shift()!;
  } catch (err) {
    if (opts.signal.aborted) {
      yield { type: "result", status: "cancelled", error: String(opts.signal.reason ?? "cancelled") };
    } else {
      yield { type: "result", status: "error", error: err instanceof Error ? err.message : String(err) };
    }
    return;
  }
  if (!sawResult) {
    yield opts.signal.aborted
      ? { type: "result", status: "cancelled", error: String(opts.signal.reason ?? "cancelled") }
      : { type: "result", status: "error", error: "agent ended without a result" };
  }
}
