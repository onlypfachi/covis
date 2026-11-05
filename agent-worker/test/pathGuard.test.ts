import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkToolCall, isInside } from "../src/pathGuard.js";

const allowed = new Set(["Read", "Edit", "Write", "Glob", "Grep"]);

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "wt-"));
  mkdirSync(path.join(root, "src"));
  const outside = mkdtempSync(path.join(tmpdir(), "outside-"));
  symlinkSync(outside, path.join(root, "escape"));
  return { root, outside };
}

describe("isInside", () => {
  it("accepts paths inside the worktree, absolute or relative", () => {
    const { root } = setup();
    expect(isInside(root, path.join(root, "src/a.ts"))).toBe(true);
    expect(isInside(root, "src/new/file.ts")).toBe(true);
    expect(isInside(root, root)).toBe(true);
  });

  it("rejects traversal and absolute escapes", () => {
    const { root } = setup();
    expect(isInside(root, "../x")).toBe(false);
    expect(isInside(root, "src/../../x")).toBe(false);
    expect(isInside(root, "/etc/passwd")).toBe(false);
  });

  it("rejects writes through a symlink that points outside", () => {
    const { root } = setup();
    expect(isInside(root, path.join(root, "escape/new.ts"))).toBe(false);
  });
});

describe("checkToolCall", () => {
  it("denies tools that are not on the allowlist", () => {
    const { root } = setup();
    expect(checkToolCall(root, allowed, "Bash", { command: "ls" })).toMatch(/not available/);
    expect(checkToolCall(root, allowed, "WebFetch", { url: "https://x" })).toMatch(/not available/);
  });

  it("denies file tools aimed outside the worktree", () => {
    const { root, outside } = setup();
    expect(checkToolCall(root, allowed, "Write", { file_path: path.join(outside, "x") })).toMatch(/outside/);
    expect(checkToolCall(root, allowed, "Grep", { pattern: "x", path: "/" })).toMatch(/outside/);
  });

  it("denies edits to git metadata but allows reading it", () => {
    const { root } = setup();
    expect(checkToolCall(root, allowed, "Write", { file_path: path.join(root, ".git/config") })).toMatch(/git metadata/);
    expect(checkToolCall(root, allowed, "Read", { file_path: path.join(root, ".git") })).toBeNull();
  });

  it("allows file tools inside the worktree", () => {
    const { root } = setup();
    expect(checkToolCall(root, allowed, "Edit", { file_path: path.join(root, "src/a.ts") })).toBeNull();
    expect(checkToolCall(root, allowed, "Glob", { pattern: "**/*.ts" })).toBeNull();
  });
});
