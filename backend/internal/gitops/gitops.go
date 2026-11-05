// Package gitops wraps the git CLI. The managed clone is bare: nothing edits it
// directly. Indexing and agent runs each get their own worktree. Approved work
// leaves only as a pushed branch for a pull request; nothing is merged here.
package gitops

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type Git struct {
	// Token, when set, is sent as an HTTP auth header for clone/fetch/push.
	// It is never written into a URL or the repo config.
	Token string
}

func (g Git) run(ctx context.Context, dir string, args ...string) (string, error) {
	return g.runEnv(ctx, dir, nil, args...)
}

func (g Git) runEnv(ctx context.Context, dir string, env []string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_CONFIG_NOSYSTEM=1")
	cmd.Env = append(cmd.Env, env...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s: %w: %s", args[0], err, strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}

func (g Git) authArgs() []string {
	if g.Token == "" {
		return nil
	}
	cred := base64.StdEncoding.EncodeToString([]byte("x-access-token:" + g.Token))
	return []string{"-c", "http.extraHeader=Authorization: Basic " + cred}
}

func (g Git) remote(ctx context.Context, dir string, args ...string) (string, error) {
	return g.run(ctx, dir, append(g.authArgs(), args...)...)
}

// EnsureClone makes a bare clone at dir if one doesn't exist, then fetches.
// It returns the default branch name.
func (g Git) EnsureClone(ctx context.Context, url, dir string) (string, error) {
	// A clone left over from a different repository (e.g. the database was
	// reset but the data dir kept) must never be reused: it would mirror the
	// wrong code. Clones are disposable, so start over.
	if _, err := os.Stat(dir); err == nil {
		origin, err := g.run(ctx, dir, "config", "--get", "remote.origin.url")
		if err != nil || strings.TrimSpace(origin) != url {
			if err := os.RemoveAll(dir); err != nil {
				return "", fmt.Errorf("remove stale clone: %w", err)
			}
		}
	}
	if _, err := os.Stat(dir); errors.Is(err, os.ErrNotExist) {
		if _, err := g.remote(ctx, "", "clone", "--bare", "--", url, dir); err != nil {
			return "", err
		}
		if _, err := g.run(ctx, dir, "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"); err != nil {
			return "", err
		}
	}
	branch, err := g.run(ctx, dir, "symbolic-ref", "--short", "HEAD")
	if err != nil {
		return "", err
	}
	branch = strings.TrimSpace(branch)
	return branch, g.Fetch(ctx, dir, branch)
}

// Fetch updates remote-tracking refs and fast-forwards the local default branch
// when that is possible. Local commits not yet pushed are never discarded.
func (g Git) Fetch(ctx context.Context, dir, branch string) error {
	if _, err := g.remote(ctx, dir, "fetch", "--prune", "origin"); err != nil {
		return err
	}
	remoteSHA, err := g.RevParse(ctx, dir, "refs/remotes/origin/"+branch)
	if err != nil {
		return nil // remote has no such branch; keep local
	}
	localSHA, err := g.RevParse(ctx, dir, "refs/heads/"+branch)
	if err != nil {
		_, err = g.run(ctx, dir, "update-ref", "refs/heads/"+branch, remoteSHA)
		return err
	}
	if localSHA == remoteSHA {
		return nil
	}
	if g.IsAncestor(ctx, dir, localSHA, remoteSHA) {
		_, err = g.run(ctx, dir, "update-ref", "refs/heads/"+branch, remoteSHA, localSHA)
		return err
	}
	return nil
}

func (g Git) RevParse(ctx context.Context, dir, ref string) (string, error) {
	out, err := g.run(ctx, dir, "rev-parse", "--verify", "--quiet", ref+"^{commit}")
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", ref, err)
	}
	return strings.TrimSpace(out), nil
}

func (g Git) IsAncestor(ctx context.Context, dir, ancestor, desc string) bool {
	_, err := g.run(ctx, dir, "merge-base", "--is-ancestor", ancestor, desc)
	return err == nil
}

// AddDetachedWorktree checks out sha read-only-by-convention for indexing.
func (g Git) AddDetachedWorktree(ctx context.Context, repoDir, path, sha string) error {
	_, err := g.run(ctx, repoDir, "worktree", "add", "--detach", "--force", path, sha)
	return err
}

// AddBranchWorktree creates branch at sha and checks it out at path.
func (g Git) AddBranchWorktree(ctx context.Context, repoDir, path, branch, sha string) error {
	_, err := g.run(ctx, repoDir, "worktree", "add", "--force", "-B", branch, path, sha)
	return err
}

func (g Git) RemoveWorktree(ctx context.Context, repoDir, path string) error {
	_, err := g.run(ctx, repoDir, "worktree", "remove", "--force", path)
	if err != nil {
		_ = os.RemoveAll(path)
		_, _ = g.run(ctx, repoDir, "worktree", "prune")
	}
	return nil
}

func (g Git) DeleteBranch(ctx context.Context, repoDir, branch string) {
	_, _ = g.run(ctx, repoDir, "branch", "-D", branch)
}

// Diff returns the full diff of the worktree against HEAD, including new files.
func (g Git) Diff(ctx context.Context, worktree string) (string, error) {
	if _, err := g.run(ctx, worktree, "add", "--intent-to-add", "--all"); err != nil {
		return "", err
	}
	return g.run(ctx, worktree, "diff", "--no-color", "--no-ext-diff", "HEAD")
}

// CommitAll commits every change in the worktree and returns the new sha.
func (g Git) CommitAll(ctx context.Context, worktree, message string) (string, error) {
	if _, err := g.run(ctx, worktree, "add", "--all"); err != nil {
		return "", err
	}
	env := []string{
		"GIT_AUTHOR_NAME=covis", "GIT_AUTHOR_EMAIL=covis@localhost",
		"GIT_COMMITTER_NAME=covis", "GIT_COMMITTER_EMAIL=covis@localhost",
	}
	if _, err := g.runEnv(ctx, worktree, env, "-c", "commit.gpgsign=false", "commit", "--no-verify", "-m", message); err != nil {
		return "", err
	}
	return g.RevParse(ctx, worktree, "HEAD")
}

// PushBranch publishes branch to origin, replacing an earlier push of the same
// branch. Only change set branches are pushed; the default branch never is.
func (g Git) PushBranch(ctx context.Context, repoDir, branch string) error {
	_, err := g.remote(ctx, repoDir, "push", "origin", "+refs/heads/"+branch+":refs/heads/"+branch)
	return err
}

// ShowFile returns a file's content at a commit, read straight from git.
func (g Git) ShowFile(ctx context.Context, repoDir, sha, path string) (string, error) {
	return g.run(ctx, repoDir, "show", sha+":"+path)
}
