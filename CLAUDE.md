# covis: guardrails for working in this repo

## Ground truth

**The git repository is the source of truth. The graph is a mirror.**

- A graph snapshot is a read-only mirror of exactly one commit (`snapshots.commit_sha`). Only the indexer writes nodes and edges (`app.IndexRepository` → `graphstore.ReplaceGraph`).
- Change sets record *intended* edits. They never write to the graph. The canvas may show them as proposals (the dashed accent outline), but never as code.
- The platform never merges. An approved change set becomes a GitHub pull request (`app.OpenPullRequest`), and a human merges it on GitHub.
- The graph changes only when the merge commit GitHub reports is re-indexed (`app.SyncPullRequest` → `RequestIndex(sha)`).
- Canvas positions (`canvas_layouts`) are visual only and are keyed by stable node key, never by semantics.

## Change set rules (enforced in code; keep them that way)

- `change_sets.request_text` and `base_commit_sha` are immutable (DB trigger). A stale base is handled by `ReviseChangeSet`, which creates a new change set. It never rewrites the old one.
- Lifecycle transitions live in `backend/internal/changeset/state.go`. Only `APPROVED` can open a pull request (`PR_OPEN`), and only `PR_OPEN` can become `MERGED`; `state_test.go` asserts both.
- Approval binds to the reviewed diff: `approveChangeSet(id, diffHash)`. `OpenPullRequest` recomputes the worktree diff and refuses to commit if it changed. A retry after `PR_FAILED` pushes the same commit and never commits again.
- Only `covis/cs-<id>` branches are pushed (`gitops.PushBranch`). The default branch is never written, locally or upstream.
- `syncPullRequest` is safe to call concurrently: the guarded transition decides which call records the outcome.
- Every agent attempt adds a new `executions` row. History is never overwritten.

## Isolation

- The managed clone is bare. Agents work only in `DATA_DIR/worktrees/cs-<id>`.
- The agent-worker (`agent-worker/`) runs the Claude Agent SDK with file tools only (Read/Edit/Write/Glob/Grep). Every call passes `canUseTool` → `pathGuard.checkToolCall`, and `settingSources: []` keeps the repo's own `.claude` config from loading. It never runs git.
- Tests run through `backend/internal/sandbox`. Each run uses a copy of the worktree, installs dependencies with `--ignore-scripts`, and runs tests with `--network none`. Repository code never runs on the host.
- `ANTHROPIC_API_KEY` is only given to the agent-worker; `GITHUB_TOKEN` only to the Go processes.
- Run end-to-end tests with `make e2e`. It starts its own throwaway stack with the fake agent and a fake GitHub API, so it never calls Claude or GitHub and never touches a running dev stack.

## Layout

- `backend/`: Go. gqlgen API (`cmd/api`), Asynq worker (`cmd/worker`), domain code in `internal/`.
- `agent-worker/`: Node/TS HTTP service that streams NDJSON agent events.
- `web/`: React + Vite + React Router + React Flow. Typed GraphQL documents via `pnpm codegen`. Lint with `pnpm lint`. typescript-eslint can't load TypeScript 7, so the `typescript` package is aliased to `@typescript/typescript6` (the API that tooling uses) and `@typescript/native` provides `tsc` 7 for `pnpm typecheck`/`build`. Keep both aliases when upgrading.

After changing `backend/graph/schema.graphqls`, run `make gen`. Put resolver helpers in `graph/helpers.go`, not in the generated resolver file.
