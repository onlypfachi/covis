package gitops

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func sh(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// newUpstream creates a non-bare repo with one commit on main.
func newUpstream(t *testing.T) string {
	dir := t.TempDir()
	sh(t, dir, "init", "-q", "-b", "main")
	if err := os.WriteFile(filepath.Join(dir, "a.ts"), []byte("export const a = 1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	sh(t, dir, "add", ".")
	sh(t, dir, "-c", "commit.gpgsign=false", "commit", "-qm", "init")
	return dir
}

func TestWorktreeDiffCommitPushBranch(t *testing.T) {
	ctx := context.Background()
	g := Git{}
	up := newUpstream(t)
	bare := filepath.Join(t.TempDir(), "clone.git")

	branch, err := g.EnsureClone(ctx, up, bare)
	if err != nil {
		t.Fatal(err)
	}
	if branch != "main" {
		t.Fatalf("default branch = %q", branch)
	}
	base, err := g.RevParse(ctx, bare, "refs/heads/main")
	if err != nil {
		t.Fatal(err)
	}

	wt := filepath.Join(t.TempDir(), "wt")
	if err := g.AddBranchWorktree(ctx, bare, wt, "covis/cs-1", base); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(wt, "b.ts"), []byte("export const b = 2\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	diff, err := g.Diff(ctx, wt)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(diff, "+export const b = 2") {
		t.Fatalf("diff missing new file:\n%s", diff)
	}
	sha, err := g.CommitAll(ctx, wt, "cs 1")
	if err != nil {
		t.Fatal(err)
	}
	if err := g.PushBranch(ctx, bare, "covis/cs-1"); err != nil {
		t.Fatal(err)
	}
	// The branch exists upstream; neither main upstream nor main in the clone moved.
	if got := sh(t, up, "rev-parse", "covis/cs-1"); got != sha {
		t.Fatalf("upstream branch = %s, want %s", got, sha)
	}
	if got := sh(t, up, "rev-parse", "main"); got != base {
		t.Fatal("pushing a change set branch moved upstream main")
	}
	if head, _ := g.RevParse(ctx, bare, "refs/heads/main"); head != base {
		t.Fatal("local main moved")
	}

	// A re-run replaces the earlier push of the same branch.
	if err := g.RemoveWorktree(ctx, bare, wt); err != nil {
		t.Fatal(err)
	}
	if err := g.AddBranchWorktree(ctx, bare, wt, "covis/cs-1", base); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(wt, "c.ts"), []byte("x\n"), 0o644)
	sha2, _ := g.CommitAll(ctx, wt, "cs 1 again")
	if err := g.PushBranch(ctx, bare, "covis/cs-1"); err != nil {
		t.Fatal(err)
	}
	if got := sh(t, up, "rev-parse", "covis/cs-1"); got != sha2 {
		t.Fatalf("re-push not applied: %s", got)
	}

	content, err := g.ShowFile(ctx, bare, sha, "b.ts")
	if err != nil || !strings.Contains(content, "b = 2") {
		t.Fatalf("ShowFile: %q %v", content, err)
	}
}

func TestEnsureCloneReplacesCloneOfAnotherRepo(t *testing.T) {
	ctx := context.Background()
	g := Git{}
	first, second := newUpstream(t), newUpstream(t)
	if err := os.WriteFile(filepath.Join(second, "only-in-second.ts"), []byte("x\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	sh(t, second, "add", ".")
	sh(t, second, "-c", "commit.gpgsign=false", "commit", "-qm", "second")

	bare := filepath.Join(t.TempDir(), "1.git")
	if _, err := g.EnsureClone(ctx, first, bare); err != nil {
		t.Fatal(err)
	}
	// Same directory, different repository URL: must mirror the second repo.
	if _, err := g.EnsureClone(ctx, second, bare); err != nil {
		t.Fatal(err)
	}
	head, _ := g.RevParse(ctx, bare, "refs/heads/main")
	if want := sh(t, second, "rev-parse", "HEAD"); head != want {
		t.Fatalf("clone mirrors %s, want second repo's %s", head, want)
	}
}
