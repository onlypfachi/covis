// Package app wires the stores, git, queue and agent client together and holds
// the orchestration logic shared by the API and the background worker.
//
// Ground rule: the git repository is the source of truth. The graph is a
// read-only mirror of one commit. Change sets never write to the graph and are
// never merged here: an approved change set becomes a GitHub pull request, and
// the graph only changes when a merged commit is re-indexed.
package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/n0/covis/backend/internal/agentclient"
	"github.com/n0/covis/backend/internal/changeset"
	"github.com/n0/covis/backend/internal/config"
	"github.com/n0/covis/backend/internal/github"
	"github.com/n0/covis/backend/internal/gitops"
	"github.com/n0/covis/backend/internal/graphstore"
	"github.com/n0/covis/backend/internal/indexer"
	"github.com/n0/covis/backend/internal/sandbox"
)

// Task types.
const (
	TaskIndex       = "index:repository"
	TaskExecute     = "changeset:execute"
	TaskPullRequest = "changeset:pull-request"
)

// Agent is the subset of the agent client the service uses.
type Agent interface {
	Run(ctx context.Context, req agentclient.RunRequest, onEvent func(agentclient.Event) error) (agentclient.Event, error)
	Cancel(ctx context.Context, runID string) error
}

// Enqueuer is the subset of the asynq client the service uses.
type Enqueuer interface {
	EnqueueContext(ctx context.Context, task *asynq.Task, opts ...asynq.Option) (*asynq.TaskInfo, error)
}

// PullRequests opens and reads pull requests on the repository's host.
type PullRequests interface {
	Create(ctx context.Context, cloneURL string, in github.NewPullRequest) (*github.PullRequest, error)
	Get(ctx context.Context, cloneURL string, number int) (*github.PullRequest, error)
}

type Tests interface {
	Run(ctx context.Context, worktree string, plan sandbox.Plan) sandbox.Result
}

type Service struct {
	Cfg        config.Config
	Graph      *graphstore.Store
	ChangeSets *changeset.Store
	Git        gitops.Git
	Queue      Enqueuer
	Agent      Agent
	Tests      Tests
	// PRs is nil when no GITHUB_TOKEN is configured; approval then refuses.
	PRs PullRequests
	Log *slog.Logger
}

func New(cfg config.Config, db *pgxpool.Pool, queue Enqueuer) *Service {
	svc := &Service{
		Cfg:        cfg,
		Graph:      graphstore.New(db),
		ChangeSets: changeset.NewStore(db),
		Git:        gitops.Git{Token: cfg.GitHubToken},
		Queue:      queue,
		Agent:      agentclient.New(cfg.AgentWorkerURL),
		Tests: sandbox.Runner{
			Image:          envOr("SANDBOX_IMAGE", "node:22-bookworm-slim"),
			InstallTimeout: 5 * time.Minute,
			TestTimeout:    10 * time.Minute,
			TmpDir:         filepath.Join(cfg.DataDir, "tmp"),
		},
		Log: slog.Default(),
	}
	if cfg.GitHubToken != "" {
		svc.PRs = github.New(cfg.GitHubAPIURL, cfg.GitHubToken)
	}
	return svc
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func (s *Service) enqueue(ctx context.Context, typ string, payload any, opts ...asynq.Option) error {
	b, _ := json.Marshal(payload)
	_, err := s.Queue.EnqueueContext(ctx, asynq.NewTask(typ, b), opts...)
	if errors.Is(err, asynq.ErrTaskIDConflict) || errors.Is(err, asynq.ErrDuplicateTask) {
		return nil
	}
	return err
}

func (s *Service) repoDir(id int) string {
	return filepath.Join(s.Cfg.ReposDir(), fmt.Sprintf("%d.git", id))
}
func (s *Service) worktreeDir(csID int) string {
	return filepath.Join(s.Cfg.WorktreesDir(), fmt.Sprintf("cs-%d", csID))
}
func branchName(csID int) string { return fmt.Sprintf("covis/cs-%d", csID) }
func runID(csID int) string      { return fmt.Sprintf("cs-%d", csID) }

// ---------- Repositories and indexing ----------

func RepoNameFromURL(u string) string {
	u = strings.TrimSuffix(strings.TrimSuffix(u, "/"), ".git")
	return path.Base(strings.ReplaceAll(u, ":", "/"))
}

func (s *Service) ConnectRepository(ctx context.Context, cloneURL string) (*graphstore.Repository, error) {
	cloneURL = strings.TrimSpace(cloneURL)
	if cloneURL == "" {
		return nil, errors.New("clone URL is required")
	}
	if strings.HasPrefix(cloneURL, "-") {
		return nil, errors.New("invalid clone URL")
	}
	repo, err := s.Graph.CreateRepository(ctx, RepoNameFromURL(cloneURL), cloneURL)
	if err != nil {
		return nil, err
	}
	return repo, s.RequestIndex(ctx, repo.ID, "")
}

type IndexPayload struct {
	RepositoryID int    `json:"repositoryId"`
	CommitSHA    string `json:"commitSha,omitempty"` // empty means the default branch head
}

func (s *Service) RequestIndex(ctx context.Context, repoID int, sha string) error {
	id := fmt.Sprintf("index:%d:%s", repoID, sha)
	if sha != "" {
		// Record the pending snapshot now, so clients see that the mirror is
		// about to change even before the worker picks up the job.
		if _, err := s.Graph.EnsureSnapshot(ctx, repoID, sha); err != nil {
			return err
		}
	} else {
		id = fmt.Sprintf("index:%d:head:%d", repoID, time.Now().Unix()/10)
	}
	return s.enqueue(ctx, TaskIndex, IndexPayload{RepositoryID: repoID, CommitSHA: sha},
		asynq.TaskID(id), asynq.MaxRetry(2), asynq.Timeout(30*time.Minute), asynq.Retention(time.Hour))
}

// IndexRepository clones or fetches the repo, then indexes one commit into a
// snapshot. It is idempotent per commit.
func (s *Service) IndexRepository(ctx context.Context, p IndexPayload) error {
	repo, err := s.Graph.Repository(ctx, p.RepositoryID)
	if err != nil {
		return err
	}
	dir := s.repoDir(repo.ID)
	if err := os.MkdirAll(s.Cfg.ReposDir(), 0o755); err != nil {
		return err
	}
	branch, err := s.Git.EnsureClone(ctx, repo.CloneURL, dir)
	if err != nil {
		return fmt.Errorf("clone: %w", err)
	}
	if err := s.Graph.SetRepositoryClone(ctx, repo.ID, dir, branch); err != nil {
		return err
	}
	sha := p.CommitSHA
	if sha == "" {
		if sha, err = s.Git.RevParse(ctx, dir, "refs/heads/"+branch); err != nil {
			return err
		}
	}
	snap, err := s.Graph.EnsureSnapshot(ctx, repo.ID, sha)
	if err != nil {
		return err
	}
	if snap.Status == graphstore.SnapshotReady {
		return nil
	}
	_ = s.Graph.SetSnapshotStatus(ctx, snap.ID, graphstore.SnapshotIndexing, "")

	g, err := s.indexCommit(ctx, dir, repo.Name, sha, snap.ID)
	if err == nil {
		err = s.Graph.ReplaceGraph(ctx, snap.ID, g)
	}
	if err != nil {
		_ = s.Graph.SetSnapshotStatus(ctx, snap.ID, graphstore.SnapshotFailed, err.Error())
		return err
	}
	s.Log.Info("indexed", "repo", repo.ID, "sha", sha, "nodes", len(g.Nodes), "edges", len(g.Edges))
	return s.Graph.SetSnapshotStatus(ctx, snap.ID, graphstore.SnapshotReady, "")
}

// indexCommit checks sha out into a temporary detached worktree and indexes it.
func (s *Service) indexCommit(ctx context.Context, repoDir, name, sha string, snapID int) (*indexer.Graph, error) {
	tmp := filepath.Join(s.Cfg.DataDir, "index", fmt.Sprintf("snap-%d", snapID))
	_ = os.MkdirAll(filepath.Dir(tmp), 0o755)
	_ = s.Git.RemoveWorktree(ctx, repoDir, tmp)
	if err := s.Git.AddDetachedWorktree(ctx, repoDir, tmp, sha); err != nil {
		return nil, err
	}
	defer s.Git.RemoveWorktree(context.WithoutCancel(ctx), repoDir, tmp)
	return indexer.Index(tmp, name)
}

// SourceExcerpt reads a node's source from git at the snapshot's commit.
func (s *Service) SourceExcerpt(ctx context.Context, snap *graphstore.Snapshot, n *graphstore.Node) (string, error) {
	if n.FilePath == "" || n.Kind == indexer.KindDirectory {
		return "", nil
	}
	content, err := s.Git.ShowFile(ctx, s.repoDir(snap.RepositoryID), snap.CommitSHA, n.FilePath)
	if err != nil {
		return "", err
	}
	if n.StartLine == 0 {
		lines := strings.SplitAfter(content, "\n")
		if len(lines) > 200 {
			lines = lines[:200]
		}
		return strings.Join(lines, ""), nil
	}
	lines := strings.SplitAfter(content, "\n")
	start, end := max(n.StartLine-1, 0), min(n.EndLine, len(lines))
	return strings.Join(lines[start:end], ""), nil
}

// ---------- Change sets ----------

type CreateChangeSetInput struct {
	RepositoryID       int
	Request            string
	AcceptanceCriteria string
	SelectedKeys       []string
}

// CreateChangeSet records a proposal against the latest indexed commit. It
// does not touch the graph or the repository.
func (s *Service) CreateChangeSet(ctx context.Context, in CreateChangeSetInput) (*changeset.ChangeSet, error) {
	if strings.TrimSpace(in.Request) == "" {
		return nil, errors.New("request is required")
	}
	snap, err := s.Graph.LatestReadySnapshot(ctx, in.RepositoryID)
	if err != nil {
		return nil, fmt.Errorf("repository has no indexed snapshot yet: %w", err)
	}
	if in.SelectedKeys == nil {
		in.SelectedKeys = []string{}
	}
	return s.ChangeSets.Create(ctx, changeset.ChangeSet{
		RepositoryID:       in.RepositoryID,
		BaseCommitSHA:      snap.CommitSHA,
		RequestText:        in.Request,
		AcceptanceCriteria: in.AcceptanceCriteria,
		SelectedKeys:       in.SelectedKeys,
	})
}

// ReviseChangeSet supersedes a change set with a new one carrying the same
// request against the latest indexed commit. The original stays as history.
func (s *Service) ReviseChangeSet(ctx context.Context, id int) (*changeset.ChangeSet, error) {
	old, err := s.ChangeSets.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	stuck := old.Status == changeset.Failed || old.Status == changeset.PRFailed
	if !old.Status.Terminal() && !stuck {
		return nil, fmt.Errorf("change set is %s; only finished or failed change sets can be revised", old.Status)
	}
	snap, err := s.Graph.LatestReadySnapshot(ctx, old.RepositoryID)
	if err != nil {
		return nil, fmt.Errorf("repository has no indexed snapshot yet: %w", err)
	}
	if stuck {
		if cs, err := s.ChangeSets.Transition(ctx, id, changeset.Cancelled, map[string]any{"reason": "superseded"}); err == nil {
			s.cleanupWorktree(ctx, cs)
		}
	}
	return s.ChangeSets.Create(ctx, changeset.ChangeSet{
		RepositoryID:       old.RepositoryID,
		BaseCommitSHA:      snap.CommitSHA,
		RequestText:        old.RequestText,
		AcceptanceCriteria: old.AcceptanceCriteria,
		SelectedKeys:       old.SelectedKeys,
		RevisionOf:         &old.ID,
	})
}

type ChangeSetPayload struct {
	ChangeSetID int `json:"changeSetId"`
}

// RunChangeSet moves a change set to EXECUTING and queues the agent run.
func (s *Service) RunChangeSet(ctx context.Context, id int) (*changeset.ChangeSet, error) {
	cs, err := s.ChangeSets.Transition(ctx, id, changeset.Executing, nil)
	if err != nil {
		return nil, err
	}
	// Agent runs cost money and are not retried automatically.
	err = s.enqueue(ctx, TaskExecute, ChangeSetPayload{id}, asynq.MaxRetry(0), asynq.Timeout(45*time.Minute), asynq.Retention(time.Hour))
	if err != nil {
		_, _ = s.ChangeSets.Transition(ctx, id, changeset.Failed, map[string]any{"error": err.Error()})
		return nil, err
	}
	return cs, nil
}

// Execute is the background job: worktree, agent, diff, tests.
func (s *Service) Execute(ctx context.Context, csID int) error {
	cs, err := s.ChangeSets.Get(ctx, csID)
	if err != nil {
		return err
	}
	if cs.Status != changeset.Executing {
		return nil // cancelled or already handled
	}
	repo, err := s.Graph.Repository(ctx, cs.RepositoryID)
	if err != nil {
		return err
	}
	ex, err := s.ChangeSets.StartExecution(ctx, csID)
	if err != nil {
		return err
	}
	fail := func(msg string) error {
		_ = s.ChangeSets.FinishExecution(ctx, ex.ID, "failed", msg)
		_ = s.ChangeSets.AddEvent(ctx, csID, changeset.EventError, map[string]any{"error": msg})
		if _, err := s.ChangeSets.Transition(ctx, csID, changeset.Failed, map[string]any{"error": msg}, changeset.Executing, changeset.Validating); err != nil {
			s.cleanupIfCancelled(ctx, csID)
		}
		return nil
	}

	repoDir := s.repoDir(repo.ID)
	if _, err := s.Git.RevParse(ctx, repoDir, cs.BaseCommitSHA); err != nil {
		return fail("base commit no longer exists in the repository")
	}
	// Every attempt starts from a fresh worktree at the immutable base commit.
	wt, branch := s.worktreeDir(csID), branchName(csID)
	_ = os.MkdirAll(s.Cfg.WorktreesDir(), 0o755)
	_ = s.Git.RemoveWorktree(ctx, repoDir, wt)
	if err := s.Git.AddBranchWorktree(ctx, repoDir, wt, branch, cs.BaseCommitSHA); err != nil {
		return fail("create worktree: " + err.Error())
	}
	if err := s.ChangeSets.SetWorktree(ctx, csID, branch, wt); err != nil {
		return err
	}

	nodes, err := s.agentContext(ctx, cs)
	if err != nil {
		return fail("build context: " + err.Error())
	}
	result, err := s.Agent.Run(ctx, agentclient.RunRequest{
		RunID: runID(csID), WorktreePath: wt, Request: cs.RequestText,
		AcceptanceCriteria: cs.AcceptanceCriteria, BaseCommit: cs.BaseCommitSHA, Nodes: nodes,
	}, func(ev agentclient.Event) error {
		return s.ChangeSets.AddEvent(ctx, csID, changeset.EventAgent, ev)
	})
	if cur, _ := s.ChangeSets.Get(ctx, csID); cur != nil && cur.Status == changeset.Cancelled {
		_ = s.ChangeSets.FinishExecution(ctx, ex.ID, "cancelled", "")
		s.cleanupWorktree(context.WithoutCancel(ctx), cur)
		return nil
	}
	if err != nil {
		return fail(err.Error())
	}
	if st, _ := result["status"].(string); st != "success" {
		msg, _ := result["error"].(string)
		return fail("agent did not finish: " + msg)
	}

	diff, err := s.Git.Diff(ctx, wt)
	if err != nil {
		return fail("diff: " + err.Error())
	}
	if strings.TrimSpace(diff) == "" {
		return fail("agent made no changes")
	}
	hash := DiffHash(diff)
	if err := s.ChangeSets.SetExecutionDiff(ctx, ex.ID, diff, hash); err != nil {
		return err
	}
	if _, err := s.ChangeSets.Transition(ctx, csID, changeset.Validating, nil, changeset.Executing); err != nil {
		s.cleanupIfCancelled(ctx, csID)
		return nil
	}

	plan := sandbox.Detect(wt, repo.TestCommand)
	res := s.Tests.Run(ctx, wt, plan)
	var code *int
	if res.Skipped == "" {
		code = &res.ExitCode
	} else {
		res.Output = res.Skipped
	}
	_ = s.ChangeSets.SetExecutionTests(ctx, ex.ID, code, res.Output)
	_ = s.ChangeSets.AddEvent(ctx, csID, changeset.EventTests, map[string]any{
		"command": plan.Test, "exitCode": code, "skipped": res.Skipped, "durationMs": res.Duration.Milliseconds(),
	})
	_ = s.ChangeSets.FinishExecution(ctx, ex.ID, "succeeded", "")
	// Failing tests do not fail the change set: a human decides at review.
	if _, err := s.ChangeSets.Transition(ctx, csID, changeset.ReadyForReview, nil, changeset.Validating); err != nil {
		s.cleanupIfCancelled(ctx, csID)
	}
	return nil
}

func (s *Service) cleanupIfCancelled(ctx context.Context, csID int) {
	if cur, err := s.ChangeSets.Get(ctx, csID); err == nil && cur.Status == changeset.Cancelled {
		s.cleanupWorktree(context.WithoutCancel(ctx), cur)
	}
}

func DiffHash(diff string) string {
	h := sha256.Sum256([]byte(diff))
	return hex.EncodeToString(h[:])
}

// agentContext gives the agent the selected nodes and their direct neighbours
// from the base commit's snapshot, as pointers into the code, not as truth.
func (s *Service) agentContext(ctx context.Context, cs *changeset.ChangeSet) ([]agentclient.ContextNode, error) {
	out := []agentclient.ContextNode{}
	if len(cs.SelectedKeys) == 0 {
		return out, nil
	}
	snap, err := s.Graph.SnapshotByCommit(ctx, cs.RepositoryID, cs.BaseCommitSHA)
	if err != nil {
		return out, nil // context is optional
	}
	selected, err := s.Graph.NodesByKeys(ctx, snap.ID, cs.SelectedKeys)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	relation := map[string]string{}
	var neighbourKeys []string
	for _, n := range selected {
		seen[n.Key] = true
		out = append(out, toContextNode(n, true, ""))
	}
	for _, n := range selected {
		in, outE, err := s.Graph.NodeEdges(ctx, snap.ID, n.Key)
		if err != nil {
			return nil, err
		}
		for _, e := range append(in, outE...) {
			other, rel := e.TargetKey, e.Kind
			if e.TargetKey == n.Key {
				other, rel = e.SourceKey, e.Kind+" (incoming)"
			}
			if !seen[other] && len(neighbourKeys) < 60 {
				seen[other] = true
				relation[other] = rel
				neighbourKeys = append(neighbourKeys, other)
			}
		}
	}
	neighbours, err := s.Graph.NodesByKeys(ctx, snap.ID, neighbourKeys)
	if err != nil {
		return nil, err
	}
	for _, n := range neighbours {
		if n.Kind != indexer.KindModule {
			out = append(out, toContextNode(n, false, relation[n.Key]))
		}
	}
	return out, nil
}

func toContextNode(n *graphstore.Node, selected bool, rel string) agentclient.ContextNode {
	return agentclient.ContextNode{Key: n.Key, Kind: n.Kind, Name: n.QualifiedName, FilePath: n.FilePath,
		StartLine: n.StartLine, EndLine: n.EndLine, Selected: selected, Relation: rel}
}

// ApproveChangeSet records explicit human approval of a specific diff and
// queues opening a pull request. The diff hash must match what the reviewer
// saw. Nothing is merged: a human merges the pull request on GitHub.
func (s *Service) ApproveChangeSet(ctx context.Context, id int, reviewedDiffHash string) (*changeset.ChangeSet, error) {
	if s.PRs == nil {
		return nil, errors.New("set GITHUB_TOKEN on the backend so approved changes can be opened as pull requests")
	}
	ex, err := s.ChangeSets.LatestExecution(ctx, id)
	if err != nil {
		return nil, errors.New("nothing to approve: no execution")
	}
	if reviewedDiffHash == "" || reviewedDiffHash != ex.DiffHash {
		return nil, errors.New("the diff changed since you reviewed it; reload and review again")
	}
	cs, err := s.ChangeSets.Transition(ctx, id, changeset.Approved, map[string]any{"diffHash": ex.DiffHash}, changeset.ReadyForReview)
	if err != nil {
		return nil, err
	}
	_ = s.ChangeSets.AddEvent(ctx, id, changeset.EventApproved, map[string]any{"by": "dev", "diffHash": ex.DiffHash, "attempt": ex.Attempt})
	return cs, s.queuePullRequest(ctx, id)
}

// RetryPullRequest re-queues pushing and opening the pull request after a
// failure. The original approval still applies: the same diff is pushed.
func (s *Service) RetryPullRequest(ctx context.Context, id int) (*changeset.ChangeSet, error) {
	cs, err := s.ChangeSets.Transition(ctx, id, changeset.Approved, map[string]any{"retry": true}, changeset.PRFailed)
	if err != nil {
		return nil, err
	}
	return cs, s.queuePullRequest(ctx, id)
}

func (s *Service) queuePullRequest(ctx context.Context, id int) error {
	err := s.enqueue(ctx, TaskPullRequest, ChangeSetPayload{id}, asynq.MaxRetry(0), asynq.Timeout(10*time.Minute))
	if err != nil {
		_, _ = s.ChangeSets.Transition(ctx, id, changeset.PRFailed, map[string]any{"error": err.Error()}, changeset.Approved)
	}
	return err
}

// OpenPullRequest commits exactly the approved diff on the change set branch,
// pushes that branch and opens a pull request against the default branch.
// The default branch is never touched.
func (s *Service) OpenPullRequest(ctx context.Context, csID int) error {
	cs, err := s.ChangeSets.Get(ctx, csID)
	if err != nil {
		return err
	}
	if cs.Status != changeset.Approved {
		return nil
	}
	repo, err := s.Graph.Repository(ctx, cs.RepositoryID)
	if err != nil {
		return err
	}
	fail := func(msg string) error {
		_ = s.ChangeSets.AddEvent(ctx, csID, changeset.EventError, map[string]any{"error": msg})
		_, _ = s.ChangeSets.Transition(ctx, csID, changeset.PRFailed, map[string]any{"error": msg}, changeset.Approved)
		return nil
	}
	if s.PRs == nil {
		return fail("GITHUB_TOKEN is not set; cannot push or open a pull request")
	}
	ex, err := s.ChangeSets.LatestExecution(ctx, csID)
	if err != nil {
		return fail("no execution to open a pull request for")
	}

	// Commit once. A retry after a failed push finds the approved commit already made.
	if cs.ResultCommitSHA == "" {
		diff, err := s.Git.Diff(ctx, cs.WorktreePath)
		if err != nil {
			return fail("diff: " + err.Error())
		}
		if DiffHash(diff) != ex.DiffHash {
			return fail("worktree changed after review; refusing to commit")
		}
		msg := fmt.Sprintf("%s\n\nChange-Set: %d\nApproved-Diff: %s", firstLine(cs.RequestText), csID, ex.DiffHash)
		sha, err := s.Git.CommitAll(ctx, cs.WorktreePath, msg)
		if err != nil {
			return fail("commit: " + err.Error())
		}
		if err := s.ChangeSets.SetResultCommit(ctx, csID, sha); err != nil {
			return err
		}
		cs.ResultCommitSHA = sha
	} else if head, _ := s.Git.RevParse(ctx, cs.WorktreePath, "HEAD"); head != cs.ResultCommitSHA {
		return fail("the change set branch no longer points at the approved commit")
	}

	if err := s.Git.PushBranch(ctx, s.repoDir(repo.ID), cs.BranchName); err != nil {
		return fail("push " + cs.BranchName + ": " + err.Error())
	}
	pr, err := s.PRs.Create(ctx, repo.CloneURL, github.NewPullRequest{
		Title: firstLine(cs.RequestText),
		Head:  cs.BranchName,
		Base:  repo.DefaultBranch,
		Body:  pullRequestBody(cs, ex),
	})
	if err != nil {
		return fail("open pull request: " + err.Error())
	}
	if err := s.ChangeSets.SetPullRequest(ctx, csID, pr.Number, pr.URL); err != nil {
		return err
	}
	_ = s.ChangeSets.AddEvent(ctx, csID, changeset.EventPROpened, map[string]any{
		"number": pr.Number, "url": pr.URL, "branch": cs.BranchName, "base": repo.DefaultBranch, "commit": cs.ResultCommitSHA,
	})
	if _, err := s.ChangeSets.Transition(ctx, csID, changeset.PROpen, nil, changeset.Approved); err != nil {
		return err
	}
	// The pushed branch lives on in the pull request; the local worktree is done.
	s.cleanupWorktree(ctx, cs)
	return nil
}

func pullRequestBody(cs *changeset.ChangeSet, ex *changeset.Execution) string {
	var b strings.Builder
	b.WriteString(strings.TrimSpace(cs.RequestText) + "\n")
	if c := strings.TrimSpace(cs.AcceptanceCriteria); c != "" {
		b.WriteString("\n**Acceptance criteria**\n\n" + c + "\n")
	}
	tests := "not run"
	if ex.TestExitCode != nil {
		tests = "passed"
		if *ex.TestExitCode != 0 {
			tests = fmt.Sprintf("failed (exit %d)", *ex.TestExitCode)
		}
	}
	fmt.Fprintf(&b, "\n---\nProposed, implemented by an agent and approved by a developer in covis (change set #%d).\n\n", cs.ID)
	fmt.Fprintf(&b, "- Base commit: `%s`\n- Agent attempt: %d\n- Tests: %s\n- Approved diff: `%s`\n", cs.BaseCommitSHA, ex.Attempt, tests, ex.DiffHash)
	return b.String()
}

// SyncPullRequest reads the pull request's state from GitHub. When it was
// merged, the merge commit is indexed so the canvas mirrors what landed.
func (s *Service) SyncPullRequest(ctx context.Context, id int) (*changeset.ChangeSet, error) {
	cs, err := s.ChangeSets.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if cs.Status != changeset.PROpen || cs.PRNumber == nil || s.PRs == nil {
		return cs, nil
	}
	repo, err := s.Graph.Repository(ctx, cs.RepositoryID)
	if err != nil {
		return nil, err
	}
	pr, err := s.PRs.Get(ctx, repo.CloneURL, *cs.PRNumber)
	if err != nil {
		return nil, err
	}
	// Concurrent syncs race on the transition; only the winner records the
	// outcome and queues the re-index.
	var te *changeset.TransitionError
	switch {
	case pr.Merged:
		next, err := s.ChangeSets.Transition(ctx, id, changeset.Merged, nil, changeset.PROpen)
		if errors.As(err, &te) {
			return s.ChangeSets.Get(ctx, id)
		} else if err != nil {
			return nil, err
		}
		_ = s.ChangeSets.AddEvent(ctx, id, changeset.EventMerged, map[string]any{"number": pr.Number, "url": pr.URL, "commit": pr.MergeCommitSHA, "branch": repo.DefaultBranch})
		// The graph catches up only by re-indexing the commit that actually landed.
		return next, s.RequestIndex(ctx, repo.ID, pr.MergeCommitSHA)
	case pr.State == "closed":
		next, err := s.ChangeSets.Transition(ctx, id, changeset.PRClosed, nil, changeset.PROpen)
		if errors.As(err, &te) {
			return s.ChangeSets.Get(ctx, id)
		} else if err != nil {
			return nil, err
		}
		_ = s.ChangeSets.AddEvent(ctx, id, changeset.EventPRClosed, map[string]any{"number": pr.Number, "url": pr.URL})
		return next, nil
	}
	return cs, nil
}

func firstLine(s string) string {
	s, _, _ = strings.Cut(strings.TrimSpace(s), "\n")
	if len(s) > 72 {
		s = s[:69] + "..."
	}
	return s
}

func (s *Service) RejectChangeSet(ctx context.Context, id int, reason string) (*changeset.ChangeSet, error) {
	cs, err := s.ChangeSets.Transition(ctx, id, changeset.Rejected, map[string]any{"reason": reason})
	if err != nil {
		return nil, err
	}
	_ = s.ChangeSets.AddEvent(ctx, id, changeset.EventRejected, map[string]any{"by": "dev", "reason": reason})
	s.cleanupWorktree(ctx, cs)
	return cs, nil
}

func (s *Service) CancelChangeSet(ctx context.Context, id int) (*changeset.ChangeSet, error) {
	prev, err := s.ChangeSets.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	cs, err := s.ChangeSets.Transition(ctx, id, changeset.Cancelled, nil)
	if err != nil {
		return nil, err
	}
	if prev.Status == changeset.Executing {
		// The worker notices the cancellation and cleans up after the agent stops.
		_ = s.Agent.Cancel(ctx, runID(id))
	} else if prev.Status != changeset.Validating {
		s.cleanupWorktree(ctx, cs)
	}
	return cs, nil
}

// cleanupWorktree removes the worktree and its local branch. A branch that was
// pushed for a pull request lives on at origin. Records are kept.
func (s *Service) cleanupWorktree(ctx context.Context, cs *changeset.ChangeSet) {
	if cs.WorktreePath == "" {
		return
	}
	repoDir := s.repoDir(cs.RepositoryID)
	_ = s.Git.RemoveWorktree(ctx, repoDir, cs.WorktreePath)
	s.Git.DeleteBranch(ctx, repoDir, cs.BranchName)
}
