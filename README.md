# covis

Connect a GitHub repository and explore its architecture as a graph on a canvas. Select components, propose a change, and let Claude implement it in an isolated git worktree. You review the diff and test results. When you approve, covis opens a pull request; it never merges anything itself.

> The repository is the source of truth. The graph mirrors one commit and only changes once a pull request is merged on GitHub and the merge commit is re-indexed. See [CLAUDE.md](CLAUDE.md).

## Architecture

```
web (React, React Router, React Flow) ──GraphQL──▶ api (Go, gqlgen) ──▶ Postgres
                                                     │ enqueue
                                                     ▼
                                                   Redis + Asynq ──▶ worker (Go)
                                                                       ├─ git: bare clone, worktrees, diff, commit, push branch
                                                                       ├─ indexer: Tree-sitter (TS/TSX/JS) → nodes and edges per commit
                                                                       ├─ sandbox: docker run --network none (tests)
                                                                       ├─ HTTP/NDJSON ──▶ agent-worker (Node, Claude Agent SDK)
                                                                       └─ GitHub REST: open and read pull requests
```

The change set lifecycle: `PROPOSED → EXECUTING → VALIDATING → READY_FOR_REVIEW → APPROVED → PR_OPEN → MERGED`. Side states are `FAILED` (re-run the agent), `PR_FAILED` (retry the push or pull request), `PR_CLOSED` (closed without merging; start a revision), `REJECTED`, and `CANCELLED`.

1. **Propose.** Select functions (or a whole file, by its box's header) on the canvas and describe the change. The change set records the request, the selected node keys, and the base commit. It does not touch the graph or the repository.
2. **Execute.** The worker creates `covis/cs-<id>` as a worktree at the base commit. The agent-worker runs the Agent SDK there, with file tools only and every path checked against the worktree. Events stream back into the change set's activity log.
3. **Validate.** The worker captures `git diff`, then runs the repo's tests in Docker on a copy of the worktree. Dependencies install with lifecycle scripts disabled, and tests run with no network.
4. **Review and approve.** The UI shows the diff, the test output, and the activity log. Approval names the exact diff hash. If tests failed or didn't run, you must check an explicit acknowledgement.
5. **Pull request.** The worker re-checks the diff and commits it on `covis/cs-<id>`. It pushes only that branch and opens a pull request into the default branch; the body carries the request, acceptance criteria, test result and approved diff hash. Nothing is merged, locally or upstream. If the push or the API call fails, the change set becomes `PR_FAILED` and can be retried without committing again.
6. **Merge on GitHub.** A human reviews and merges the pull request on GitHub. Opening the change set (or "Check status") reads the pull request. Once it's merged, the merge commit is indexed and the canvas moves to it; a pull request closed without merging becomes `PR_CLOSED`.

## Running locally

Requirements: Go 1.24+ with cgo, Node 22+, pnpm, Docker, git.

```sh
cp .env.example .env        # add ANTHROPIC_API_KEY, and GITHUB_TOKEN (needed to open pull requests)
make install
make dev                    # postgres + redis, then api :8787, worker, agent-worker :8790, web :5187
```

Open http://localhost:5187 and paste a clone URL. A local path to a git repo works too. Use `COVIS_FAKE_AGENT=1 make dev` to try the whole flow without calling Claude: the fake agent appends the request to `COVIS_CHANGES.md`.

Useful settings: `AGENT_MODEL` (default `claude-opus-5-5`), `AGENT_MAX_TURNS`, `AGENT_MAX_BUDGET_USD`, `AGENT_TIMEOUT_MS`, and `SANDBOX_IMAGE` (default `node:22-bookworm-slim`). You can set a per-repo test command in the canvas sidebar.

## Tests

```sh
make test     # Go unit + integration tests (real Postgres and git) and agent-worker vitest
make e2e      # Playwright on a throwaway stack: connect → explore → propose → review → approve → pull request → merge → re-index
cd web && pnpm lint && pnpm typecheck
```

The Go suite includes indexer goldens (`internal/indexer/testdata`), a gitops suite against temporary repos, and the state machine tests. It also covers the full change set pipeline against Postgres (`internal/app`) and a real Docker sandbox run that asserts network isolation (`internal/sandbox`, skipped with `-short`).

## Scope of this version

- TypeScript/JavaScript analysis: files, classes, functions, methods, interfaces, and types. Imports resolve through relative paths, `tsconfig` paths, barrel re-exports, and `export *`. Calls resolve through imports, `this`, typed fields, constructor parameter properties, and inherited methods. Name-only matches are flagged `inferred`.
- The canvas shows functions and methods, each file drawn as a box around its own, with arrows for calls. Files are stacked to fill the screen; drag to rearrange, and "Layout" resets it. Classes, files and other components open in the inspector.
- Single dev user. A `users` table exists so real auth can be added later.
- Repo access uses a clone URL plus `GITHUB_TOKEN`. There is no GitHub App or webhook yet: pull request status is checked when you open a change set, and other upstream commits are picked up with "Re-index".
