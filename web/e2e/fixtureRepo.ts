import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** A fresh git repo built from the indexer fixture. The backend clones it like any remote. */
export function createFixtureRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "covis-e2e-"));
  cpSync(path.resolve(import.meta.dirname, "../../backend/internal/indexer/testdata/sample-ts"), dir, { recursive: true });
  rmSync(path.join(dir, "node_modules"), { recursive: true, force: true });
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: dir,
      env: { ...process.env, GIT_AUTHOR_NAME: "e2e", GIT_AUTHOR_EMAIL: "e2e@x", GIT_COMMITTER_NAME: "e2e", GIT_COMMITTER_EMAIL: "e2e@x" },
    });
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "init");
  return dir;
}
