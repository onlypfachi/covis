// Request contract shared with backend/internal/agentclient.

export interface ContextNode {
  key: string;
  kind: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  selected: boolean;
  relation?: string;
}

export interface RunRequest {
  runId: string;
  worktreePath: string;
  request: string;
  acceptanceCriteria: string;
  baseCommit: string;
  nodes: ContextNode[];
}

/** One NDJSON line streamed back to the backend. The last one has type "result". */
export type WorkerEvent =
  | { type: "started"; runId: string; model: string }
  | { type: "assistant_text"; text: string }
  | { type: "tool_use"; tool: string; input: Record<string, unknown> }
  | { type: "tool_denied"; tool: string; reason: string }
  | { type: "tool_result"; isError: boolean; preview: string }
  | {
      type: "result";
      status: "success" | "error" | "cancelled";
      summary?: string;
      error?: string;
      turns?: number;
      costUsd?: number;
    };
