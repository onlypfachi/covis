import { realpathSync } from "node:fs";
import path from "node:path";

/** Resolve symlinks for the longest existing prefix of p, so a not-yet-created
 * file under a symlinked directory is still checked against its real location. */
function realish(p: string): string {
  const parts: string[] = [];
  let cur = path.resolve(p);
  for (;;) {
    try {
      return path.join(realpathSync(cur), ...parts.reverse());
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      parts.push(path.basename(cur));
      cur = parent;
    }
  }
}

/** True when target (absolute, or relative to root) stays inside root. */
export function isInside(root: string, target: string): boolean {
  const realRoot = realish(root);
  const abs = path.isAbsolute(target) ? target : path.join(root, target);
  const rel = path.relative(realRoot, realish(abs));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Paths a file tool would touch, by tool name. */
export function toolPaths(tool: string, input: Record<string, unknown>): string[] {
  const s = (k: string) => (typeof input[k] === "string" ? [input[k] as string] : []);
  switch (tool) {
    case "Read":
    case "Edit":
    case "Write":
    case "MultiEdit":
      return s("file_path");
    case "NotebookEdit":
      return s("notebook_path");
    case "Glob":
    case "Grep":
      return s("path");
    default:
      return [];
  }
}

const GIT_DIR = /(^|[\\/])\.git([\\/]|$)/;

/** Decide whether a tool call may run inside the worktree. Returns a denial
 * reason, or null to allow. */
export function checkToolCall(
  root: string,
  allowed: ReadonlySet<string>,
  tool: string,
  input: Record<string, unknown>,
): string | null {
  if (!allowed.has(tool)) return `${tool} is not available in this sandbox`;
  for (const p of toolPaths(tool, input)) {
    if (!isInside(root, p)) return `${p} is outside the change set worktree`;
    if (GIT_DIR.test(p) && tool !== "Read") return "git metadata is managed by the platform";
  }
  return null;
}
