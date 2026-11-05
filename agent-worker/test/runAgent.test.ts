import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Options, SDKMessage, query } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { runAgent } from "../src/runAgent.js";
import { validateRun } from "../src/server.js";
import type { RunRequest, WorkerEvent } from "../src/types.js";

const root = mkdtempSync(path.join(tmpdir(), "wt-"));
const req: RunRequest = {
  runId: "cs-1",
  worktreePath: root,
  request: "Add a refund method",
  acceptanceCriteria: "",
  baseCommit: "abc123",
  nodes: [{ key: "class:a.ts#A", kind: "class", name: "A", filePath: "a.ts", startLine: 1, endLine: 9, selected: true }],
};

/** A stand-in for query() that exercises canUseTool, then emits the given messages. */
function fakeQuery(messages: SDKMessage[], probes: Array<[string, Record<string, unknown>]> = []) {
  let seen: Options | undefined;
  const fn = (({ options }: { options: Options }) => {
    seen = options;
    return (async function* () {
      for (const [tool, input] of probes) {
        await options.canUseTool!(tool, input, { signal: new AbortController().signal } as never);
      }
      yield* messages;
    })();
  }) as unknown as typeof query;
  return { fn, options: () => seen! };
}

async function collect(gen: AsyncGenerator<WorkerEvent>) {
  const out: WorkerEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const assistant = (content: unknown[]) => ({ type: "assistant", message: { content }, parent_tool_use_id: null }) as unknown as SDKMessage;
const success = { type: "result", subtype: "success", is_error: false, result: "Done.", num_turns: 3, total_cost_usd: 0.12 } as unknown as SDKMessage;

describe("runAgent", () => {
  it("configures an isolated, file-tools-only session in the worktree", async () => {
    const q = fakeQuery([success]);
    await collect(runAgent(req, { signal: new AbortController().signal, model: "claude-opus-5-5", maxTurns: 5, queryFn: q.fn }));
    const o = q.options();
    expect(o.cwd).toBe(root);
    expect(o.tools).toEqual(["Read", "Edit", "Write", "Glob", "Grep"]);
    expect(o.disallowedTools).toContain("Bash");
    expect(o.settingSources).toEqual([]);
    expect(o.allowedTools).toBeUndefined(); // nothing bypasses canUseTool
    expect(o.env).not.toHaveProperty("GITHUB_TOKEN");
  });

  it("normalizes messages and reports denied tool calls", async () => {
    const q = fakeQuery(
      [assistant([{ type: "text", text: "Editing." }, { type: "tool_use", id: "t1", name: "Edit", input: { file_path: "a.ts" } }]), success],
      [["Bash", { command: "curl evil" }], ["Write", { file_path: "/etc/x" }]],
    );
    const events = await collect(runAgent(req, { signal: new AbortController().signal, model: "m", maxTurns: 5, queryFn: q.fn }));
    expect(events.filter((e) => e.type === "tool_denied")).toHaveLength(2);
    expect(events).toContainEqual({ type: "assistant_text", text: "Editing." });
    expect(events).toContainEqual({ type: "tool_use", tool: "Edit", input: { file_path: "a.ts" } });
    expect(events.at(-1)).toMatchObject({ type: "result", status: "success", summary: "Done.", turns: 3 });
  });

  it("maps SDK errors and missing results to a single error result", async () => {
    const maxTurns = { type: "result", subtype: "error_max_turns", is_error: true, num_turns: 5, total_cost_usd: 1 } as unknown as SDKMessage;
    let events = await collect(runAgent(req, { signal: new AbortController().signal, model: "m", maxTurns: 5, queryFn: fakeQuery([maxTurns]).fn }));
    expect(events.at(-1)).toMatchObject({ status: "error", error: "error_max_turns" });

    events = await collect(runAgent(req, { signal: new AbortController().signal, model: "m", maxTurns: 5, queryFn: fakeQuery([]).fn }));
    expect(events.filter((e) => e.type === "result")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ status: "error" });
  });

  it("reports cancellation when aborted", async () => {
    const ac = new AbortController();
    ac.abort("cancelled by user");
    const events = await collect(runAgent(req, { signal: ac.signal, model: "m", maxTurns: 5, queryFn: fakeQuery([]).fn }));
    expect(events.at(-1)).toMatchObject({ type: "result", status: "cancelled" });
  });
});

describe("validateRun", () => {
  const wtRoot = path.dirname(root);
  it("only accepts worktrees under the configured root", () => {
    expect(validateRun({ ...req }, wtRoot).worktreePath).toBe(root);
    expect(() => validateRun({ ...req, worktreePath: "/etc" }, wtRoot)).toThrow(/outside/);
    expect(() => validateRun({ ...req, worktreePath: wtRoot }, wtRoot)).toThrow(/outside/);
    expect(() => validateRun({ ...req, runId: "../x" }, wtRoot)).toThrow(/runId/);
  });
});
