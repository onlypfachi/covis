import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { WorkerEvent } from "./types.js";

const MAX_TEXT = 4000;
const clip = (s: string, n = MAX_TEXT) => (s.length > n ? s.slice(0, n) + "…" : s);

/** Keep tool inputs small: file contents are visible in the final diff anyway. */
function summarizeInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = typeof v === "string" ? clip(v, 300) : v;
  }
  return out;
}

/** Reduce SDK messages to the compact events the backend records. */
export function normalize(msg: SDKMessage): WorkerEvent[] {
  switch (msg.type) {
    case "assistant": {
      const out: WorkerEvent[] = [];
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) {
          out.push({ type: "assistant_text", text: clip(block.text) });
        } else if (block.type === "tool_use") {
          out.push({ type: "tool_use", tool: block.name, input: summarizeInput(block.input) });
        }
      }
      return out;
    }
    case "user": {
      const content = msg.message.content;
      if (typeof content === "string") return [];
      const out: WorkerEvent[] = [];
      for (const block of content) {
        if (block.type !== "tool_result") continue;
        const text =
          typeof block.content === "string"
            ? block.content
            : (block.content ?? []).map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
        out.push({ type: "tool_result", isError: Boolean(block.is_error), preview: clip(text, 500) });
      }
      return out;
    }
    case "result":
      if (msg.subtype === "success" && !msg.is_error) {
        return [{ type: "result", status: "success", summary: clip(msg.result), turns: msg.num_turns, costUsd: msg.total_cost_usd }];
      }
      return [{ type: "result", status: "error", error: msg.subtype, turns: msg.num_turns, costUsd: msg.total_cost_usd }];
    default:
      return [];
  }
}
