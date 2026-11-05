import type { RunRequest } from "./types.js";

export const SYSTEM_APPEND = `
You are implementing one proposed change set in an isolated git worktree.

- The working directory is a fresh checkout of commit {{BASE}}. The files on disk are the source of truth. The architecture graph you are given was derived from them and may be incomplete; verify against the code before relying on it.
- Make the smallest change that satisfies the request and its acceptance criteria. Follow the existing style and conventions of the surrounding code.
- Add or update tests next to the code you change when the repository has tests.
- Do not commit, create branches, or touch the .git directory. A human reviews your diff and decides whether it is merged.
- You cannot run commands. The platform runs the test suite after you finish.
- When you are done, reply with a short summary of what you changed and anything the reviewer should check.
`.trim();

export function systemAppend(req: RunRequest): string {
  return SYSTEM_APPEND.replace("{{BASE}}", req.baseCommit.slice(0, 12));
}

export function buildPrompt(req: RunRequest): string {
  const lines: string[] = [];
  lines.push("## Requested change", "", req.request.trim(), "");
  if (req.acceptanceCriteria.trim()) {
    lines.push("## Acceptance criteria", "", req.acceptanceCriteria.trim(), "");
  }
  const selected = req.nodes.filter((n) => n.selected);
  const related = req.nodes.filter((n) => !n.selected);
  const fmt = (n: RunRequest["nodes"][number]) => {
    const loc = n.filePath ? ` — ${n.filePath}${n.startLine ? `:${n.startLine}-${n.endLine}` : ""}` : "";
    const rel = n.relation ? ` (${n.relation})` : "";
    return `- ${n.kind} \`${n.name}\`${loc}${rel}`;
  };
  if (selected.length) {
    lines.push("## Components the user selected", "", ...selected.map(fmt), "");
  }
  if (related.length) {
    lines.push("## Directly related components", "", ...related.map(fmt), "");
  }
  return lines.join("\n");
}
