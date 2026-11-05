// Package sandbox runs a repository's tests inside a throwaway Docker
// container. Repository scripts are untrusted: dependencies are installed with
// lifecycle scripts disabled, and tests run with no network on a copy of the
// worktree so the reviewed tree is never touched.
package sandbox

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type Runner struct {
	Image          string
	InstallTimeout time.Duration
	TestTimeout    time.Duration
	TmpDir         string
}

type Plan struct {
	Install string
	Test    string
}

type Result struct {
	// Skipped is non-empty when tests were not run, with the reason.
	Skipped  string
	ExitCode int
	Output   string
	Duration time.Duration
}

const maxOutput = 64 << 10

var ErrDockerUnavailable = errors.New("docker is not available")

// Detect derives install and test commands from package.json. override, when
// set, replaces the test command.
func Detect(worktree, override string) Plan {
	raw, err := os.ReadFile(filepath.Join(worktree, "package.json"))
	if err != nil {
		return Plan{Test: override}
	}
	var pkg struct {
		Scripts         map[string]string `json:"scripts"`
		Dependencies    map[string]any    `json:"dependencies"`
		DevDependencies map[string]any    `json:"devDependencies"`
	}
	_ = json.Unmarshal(raw, &pkg)

	pm, install := "npm", ""
	switch {
	case exists(worktree, "pnpm-lock.yaml"):
		pm, install = "pnpm", "corepack enable --install-directory /tmp/bin && PATH=/tmp/bin:$PATH pnpm install --frozen-lockfile --ignore-scripts"
	case exists(worktree, "yarn.lock"):
		pm, install = "yarn", "corepack enable --install-directory /tmp/bin && PATH=/tmp/bin:$PATH yarn install --frozen-lockfile --ignore-scripts"
	case exists(worktree, "package-lock.json"):
		install = "npm ci --ignore-scripts --no-audit --no-fund"
	case len(pkg.Dependencies)+len(pkg.DevDependencies) > 0:
		install = "npm install --ignore-scripts --no-audit --no-fund"
	}
	test := override
	if test == "" && pkg.Scripts["test"] != "" && !strings.Contains(pkg.Scripts["test"], "no test specified") {
		test = pm + " test"
		if pm != "npm" {
			test = "PATH=/tmp/bin:$PATH " + test
		}
	}
	return Plan{Install: install, Test: test}
}

func exists(dir, name string) bool {
	_, err := os.Stat(filepath.Join(dir, name))
	return err == nil
}

func (r Runner) Available(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := exec.CommandContext(ctx, "docker", "info", "--format", "{{.ServerVersion}}").Run(); err != nil {
		return ErrDockerUnavailable
	}
	return nil
}

// Run copies worktree, installs dependencies (network on, scripts off), then
// runs tests with networking disabled. It never runs repository code on the host.
func (r Runner) Run(ctx context.Context, worktree string, plan Plan) Result {
	if plan.Test == "" {
		return Result{Skipped: "no test command found (set one on the repository)"}
	}
	if err := r.Available(ctx); err != nil {
		return Result{Skipped: "docker unavailable; tests are never run on the host"}
	}
	start := time.Now()
	work, err := os.MkdirTemp(r.TmpDir, "sandbox-")
	if err != nil {
		return Result{ExitCode: -1, Output: err.Error()}
	}
	defer os.RemoveAll(work)
	if out, err := exec.CommandContext(ctx, "cp", "-a", worktree+"/.", work).CombinedOutput(); err != nil {
		return Result{ExitCode: -1, Output: "copy worktree: " + string(out)}
	}
	// The worktree's .git file points at the managed clone; tests don't get it.
	_ = os.RemoveAll(filepath.Join(work, ".git"))

	var log bytes.Buffer
	if plan.Install != "" {
		fmt.Fprintf(&log, "$ %s\n", plan.Install)
		code := r.docker(ctx, work, plan.Install, true, r.InstallTimeout, &log)
		if code != 0 {
			return Result{ExitCode: code, Output: tail(log.String()), Duration: time.Since(start)}
		}
	}
	fmt.Fprintf(&log, "$ %s\n", plan.Test)
	code := r.docker(ctx, work, plan.Test, false, r.TestTimeout, &log)
	return Result{ExitCode: code, Output: tail(log.String()), Duration: time.Since(start)}
}

func (r Runner) docker(ctx context.Context, dir, script string, network bool, timeout time.Duration, out *bytes.Buffer) int {
	name := fmt.Sprintf("covis-sandbox-%d", time.Now().UnixNano())
	args := []string{"run", "--rm", "--name", name,
		"--user", fmt.Sprintf("%d:%d", os.Getuid(), os.Getgid()),
		"--cap-drop", "ALL", "--security-opt", "no-new-privileges",
		"--memory", "2g", "--cpus", "2", "--pids-limit", "512",
		"-e", "HOME=/tmp", "-e", "CI=1", "-e", "COREPACK_HOME=/tmp/corepack", "-e", "npm_config_cache=/tmp/npm",
		"-v", dir + ":/w", "-w", "/w",
	}
	if !network {
		args = append(args, "--network", "none")
	}
	args = append(args, r.Image, "sh", "-c", script)

	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(runCtx, "docker", args...)
	cmd.Stdout, cmd.Stderr = out, out
	err := cmd.Run()
	if runCtx.Err() != nil {
		// Killing the CLI does not stop the container.
		_ = exec.Command("docker", "rm", "-f", name).Run()
		fmt.Fprintf(out, "\n[sandbox] timed out after %s\n", timeout)
		return 124
	}
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		return ee.ExitCode()
	}
	if err != nil {
		fmt.Fprintf(out, "\n[sandbox] %v\n", err)
		return -1
	}
	return 0
}

func tail(s string) string {
	if len(s) <= maxOutput {
		return s
	}
	return "[...truncated...]\n" + s[len(s)-maxOutput:]
}
