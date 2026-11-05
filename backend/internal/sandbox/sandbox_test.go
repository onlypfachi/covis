package sandbox

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func write(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestDetect(t *testing.T) {
	cases := []struct {
		name, pkg, lock string
		install, test   string
	}{
		{"no package.json", "", "", "", ""},
		{"npm default stub", `{"scripts":{"test":"echo \"Error: no test specified\" && exit 1"}}`, "", "", ""},
		{"npm lockfile", `{"scripts":{"test":"vitest run"},"devDependencies":{"vitest":"1"}}`, "package-lock.json", "npm ci --ignore-scripts --no-audit --no-fund", "npm test"},
		{"pnpm lockfile", `{"scripts":{"test":"vitest"}}`, "pnpm-lock.yaml", "pnpm install --frozen-lockfile --ignore-scripts", "pnpm test"},
		{"no deps", `{"scripts":{"test":"node --test"}}`, "", "", "npm test"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			if c.pkg != "" {
				write(t, dir, "package.json", c.pkg)
			}
			if c.lock != "" {
				write(t, dir, c.lock, "")
			}
			p := Detect(dir, "")
			if !strings.Contains(p.Install, c.install) || (c.install == "" && p.Install != "") {
				t.Errorf("install = %q, want %q", p.Install, c.install)
			}
			if !strings.HasSuffix(p.Test, c.test) || (c.test == "" && p.Test != "") {
				t.Errorf("test = %q, want %q", p.Test, c.test)
			}
			if p.Install != "" && !strings.Contains(p.Install, "--ignore-scripts") {
				t.Error("install must disable lifecycle scripts")
			}
		})
	}
	if p := Detect(t.TempDir(), "make test"); p.Test != "make test" {
		t.Errorf("override ignored: %q", p.Test)
	}
}

func TestRunSkipsWithoutCommand(t *testing.T) {
	if r := (Runner{}).Run(context.Background(), t.TempDir(), Plan{}); r.Skipped == "" {
		t.Fatal("expected skip")
	}
}

// TestDockerRun really runs a container. It needs Docker and the node image.
func TestDockerRun(t *testing.T) {
	if testing.Short() {
		t.Skip("short mode")
	}
	r := Runner{Image: "node:22-bookworm-slim", InstallTimeout: time.Minute, TestTimeout: 2 * time.Minute, TmpDir: t.TempDir()}
	if err := r.Available(context.Background()); err != nil {
		t.Skip("docker not available")
	}
	wt := t.TempDir()
	write(t, wt, "package.json", `{"scripts":{"test":"node --test"}}`)
	write(t, wt, "sum.test.mjs", `
import test from "node:test";
import assert from "node:assert";
import { writeFileSync } from "node:fs";
test("sum", () => assert.equal(1 + 1, 2));
test("no network", async () => {
  await assert.rejects(fetch("https://example.com", { signal: AbortSignal.timeout(3000) }));
});
test("writes stay in the copy", () => writeFileSync("written-by-test.txt", "x"));
`)
	res := r.Run(context.Background(), wt, Detect(wt, ""))
	if res.Skipped != "" || res.ExitCode != 0 {
		t.Fatalf("exit=%d skipped=%q\n%s", res.ExitCode, res.Skipped, res.Output)
	}
	if _, err := os.Stat(filepath.Join(wt, "written-by-test.txt")); !os.IsNotExist(err) {
		t.Fatal("test run modified the reviewed worktree")
	}

	write(t, wt, "fail.test.mjs", `import test from "node:test"; test("fails", () => { throw new Error("boom") });`)
	if res := r.Run(context.Background(), wt, Detect(wt, "")); res.ExitCode == 0 {
		t.Fatalf("failing test reported success:\n%s", res.Output)
	}
}
