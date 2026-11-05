import { appendFile } from "node:fs/promises";
import path from "node:path";
import type { RunRequest, WorkerEvent } from "./types.js";

/** Deterministic stand-in for the real agent, enabled with COVIS_FAKE_AGENT=1.
 * Used by integration and end-to-end tests; never calls the Claude API. */
export async function* runFakeAgent(req: RunRequest, signal: AbortSignal): AsyncGenerator<WorkerEvent> {
  const file = "COVIS_CHANGES.md";
  yield { type: "assistant_text", text: `Fake agent applying: ${req.request}` };
  yield { type: "tool_use", tool: "Write", input: { file_path: file } };
  if (signal.aborted) {
    yield { type: "result", status: "cancelled" };
    return;
  }
  await appendFile(path.join(req.worktreePath, file), `- ${req.request.split("\n")[0]}\n`);
  yield { type: "tool_result", isError: false, preview: "ok" };
  yield { type: "result", status: "success", summary: `Appended the request to ${file}.`, turns: 1, costUsd: 0 };
}
