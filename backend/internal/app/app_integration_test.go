package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/hibiken/asynq"

	"github.com/n0/covis/backend/internal/agentclient"
	"github.com/n0/covis/backend/internal/changeset"
	"github.com/n0/covis/backend/internal/config"
	"github.com/n0/covis/backend/internal/db"
	"github.com/n0/covis/backend/internal/github"
	"github.com/n0/covis/backend/internal/graphstore"
	"github.com/n0/covis/backend/internal/sandbox"
)

// These tests drive the full pipeline against a real Postgres and real git:
// the upstream repo is a real git remote that branches are pushed to. Only the
// agent, the test sandbox and the GitHub API are stubbed. Set TEST_DATABASE_URL to run:
//
//	TEST_DATABASE_URL=postgres://covis:covis@localhost:5435/covis_test?sslmode=disable go test ./internal/app

// inlineQueue runs tasks synchronously so a test can follow the whole flow.
type inlineQueue struct{ svc *Service }

func (q *inlineQueue) EnqueueContext(ctx context.Context, t *asynq.Task, _ ...asynq.Option) (*asynq.TaskInfo, error) {
	switch t.Type() {
	case TaskIndex:
		var p IndexPayload
		_ = json.Unmarshal(t.Payload(), &p)
		return &asynq.TaskInfo{}, q.svc.IndexRepository(ctx, p)
	case TaskExecute, TaskPullRequest:
		var p ChangeSetPayload
		_ = json.Unmarshal(t.Payload(), &p)
		if t.Type() == TaskExecute {
			return &asynq.TaskInfo{}, q.svc.Execute(ctx, p.ChangeSetID)
		}
		return &asynq.TaskInfo{}, q.svc.OpenPullRequest(ctx, p.ChangeSetID)
	}
	return nil, errors.New("unknown task " + t.Type())
}

// fakeAgent appends a refund method to PaymentService, like a real run would.
type fakeAgent struct{ calls []agentclient.RunRequest }

func (a *fakeAgent) Run(_ context.Context, req agentclient.RunRequest, onEvent func(agentclient.Event) error) (agentclient.Event, error) {
	a.calls = append(a.calls, req)
	p := filepath.Join(req.WorktreePath, "src/payments/payment.service.ts")
	src, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	edited := strings.Replace(string(src), "  private validate(", "  async refund(chargeId: string) {\n    return chargeId;\n  }\n\n  private validate(", 1)
	if err := os.WriteFile(p, []byte(edited), 0o644); err != nil {
		return nil, err
	}
	_ = onEvent(agentclient.Event{"type": "tool_use", "tool": "Edit"})
	res := agentclient.Event{"type": "result", "status": "success", "summary": "added refund"}
	_ = onEvent(res)
	return res, nil
}

func (a *fakeAgent) Cancel(context.Context, string) error { return nil }

// fakeGitHub records pull requests instead of calling GitHub.
type fakeGitHub struct {
	created  []github.NewPullRequest
	prs      map[int]*github.PullRequest
	failNext error
}

func (f *fakeGitHub) Create(_ context.Context, _ string, in github.NewPullRequest) (*github.PullRequest, error) {
	if err := f.failNext; err != nil {
		f.failNext = nil
		return nil, err
	}
	f.created = append(f.created, in)
	n := len(f.created)
	pr := &github.PullRequest{Number: n, URL: fmt.Sprintf("https://github.com/acme/shop/pull/%d", n), State: "open"}
	f.prs[n] = pr
	return pr, nil
}

func (f *fakeGitHub) Get(_ context.Context, _ string, number int) (*github.PullRequest, error) {
	pr, ok := f.prs[number]
	if !ok {
		return nil, errors.New("not found")
	}
	cp := *pr
	return &cp, nil
}

type passingTests struct{}

func (passingTests) Run(context.Context, string, sandbox.Plan) sandbox.Result {
	return sandbox.Result{ExitCode: 0, Output: "1 passed"}
}

func gitCmd(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// upstreamFromFixture turns the indexer fixture into a git repo with one commit.
func upstreamFromFixture(t *testing.T) string {
	dir := t.TempDir()
	if out, err := exec.Command("cp", "-a", "../indexer/testdata/sample-ts/.", dir).CombinedOutput(); err != nil {
		t.Fatalf("copy fixture: %s", out)
	}
	_ = os.RemoveAll(filepath.Join(dir, "node_modules"))
	gitCmd(t, dir, "init", "-q", "-b", "main")
	gitCmd(t, dir, "add", ".")
	gitCmd(t, dir, "-c", "commit.gpgsign=false", "commit", "-qm", "init")
	return dir
}

func newTestService(t *testing.T) (*Service, *fakeAgent, *fakeGitHub) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := db.Migrate(pool); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `TRUNCATE repositories, snapshots, nodes, edges, canvas_layouts, change_sets, change_set_events, executions RESTART IDENTITY CASCADE`); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{DatabaseURL: url, DataDir: t.TempDir()}
	agent := &fakeAgent{}
	svc := New(cfg, pool, nil)
	svc.Queue = &inlineQueue{svc}
	svc.Agent = agent
	svc.Tests = passingTests{}
	gh := &fakeGitHub{prs: map[int]*github.PullRequest{}}
	svc.PRs = gh
	return svc, agent, gh
}

// readyForReview connects a fresh upstream and runs one change set up to review.
func readyForReview(t *testing.T, svc *Service, request string, keys ...string) (upstream string, cs *changeset.ChangeSet, ex *changeset.Execution) {
	t.Helper()
	ctx := context.Background()
	upstream = upstreamFromFixture(t)
	repo, err := svc.ConnectRepository(ctx, upstream)
	if err != nil {
		t.Fatal(err)
	}
	cs, err = svc.CreateChangeSet(ctx, CreateChangeSetInput{RepositoryID: repo.ID, Request: request, SelectedKeys: keys})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.RunChangeSet(ctx, cs.ID); err != nil {
		t.Fatal(err)
	}
	cs, _ = svc.ChangeSets.Get(ctx, cs.ID)
	if cs.Status != changeset.ReadyForReview {
		t.Fatalf("status = %s, want READY_FOR_REVIEW", cs.Status)
	}
	ex, err = svc.ChangeSets.LatestExecution(ctx, cs.ID)
	if err != nil {
		t.Fatal(err)
	}
	return upstream, cs, ex
}

const (
	svcFile    = "src/payments/payment.service.ts"
	serviceKey = "class:" + svcFile + "#PaymentService"
	refundKey  = "method:" + svcFile + "#PaymentService.refund"
)

func TestChangeSetLifecycle(t *testing.T) {
	ctx := context.Background()
	svc, agent, gh := newTestService(t)
	upstream, cs, ex := readyForReview(t, svc, "Add a refund method to PaymentService\n\nDetails.", serviceKey)
	base, _ := svc.Graph.SnapshotByCommit(ctx, cs.RepositoryID, cs.BaseCommitSHA)

	// The agent got graph context: the selected class plus neighbours.
	if len(agent.calls) != 1 || len(agent.calls[0].Nodes) < 2 || !agent.calls[0].Nodes[0].Selected {
		t.Fatalf("agent context = %+v", agent.calls)
	}
	if !strings.Contains(ex.Diff, "+  async refund(chargeId: string)") || ex.TestExitCode == nil || *ex.TestExitCode != 0 {
		t.Fatalf("execution = %+v", ex)
	}

	// Approval must name the exact reviewed diff.
	if _, err := svc.ApproveChangeSet(ctx, cs.ID, "stale-hash"); err == nil {
		t.Fatal("approved with a stale diff hash")
	}
	if _, err := svc.ApproveChangeSet(ctx, cs.ID, ex.DiffHash); err != nil {
		t.Fatal(err)
	}
	cs, _ = svc.ChangeSets.Get(ctx, cs.ID)
	if cs.Status != changeset.PROpen || cs.PRNumber == nil || *cs.PRNumber != 1 || cs.PRURL == "" {
		t.Fatalf("after approve: %+v", cs)
	}

	// A pull request was opened from the pushed change set branch...
	if len(gh.created) != 1 {
		t.Fatalf("pull requests = %+v", gh.created)
	}
	pr := gh.created[0]
	if pr.Head != "covis/cs-1" || pr.Base != "main" || pr.Title != "Add a refund method to PaymentService" ||
		!strings.Contains(pr.Body, "change set #1") || !strings.Contains(pr.Body, ex.DiffHash) || !strings.Contains(pr.Body, "Tests: passed") {
		t.Fatalf("pull request = %+v", pr)
	}
	if got := gitCmd(t, upstream, "rev-parse", "covis/cs-1"); got != cs.ResultCommitSHA {
		t.Fatalf("pushed branch = %s, want %s", got, cs.ResultCommitSHA)
	}
	if parent := gitCmd(t, upstream, "rev-parse", "covis/cs-1^"); parent != cs.BaseCommitSHA {
		t.Fatalf("branch commit parent = %s, want base %s", parent, cs.BaseCommitSHA)
	}
	// ...and nothing was merged, upstream or locally.
	if got := gitCmd(t, upstream, "rev-parse", "main"); got != cs.BaseCommitSHA {
		t.Fatal("upstream main moved")
	}
	if head, _ := svc.Git.RevParse(ctx, svc.repoDir(cs.RepositoryID), "refs/heads/main"); head != cs.BaseCommitSHA {
		t.Fatal("local main moved")
	}
	if _, err := os.Stat(cs.WorktreePath); !os.IsNotExist(err) {
		t.Fatal("worktree not cleaned up after opening the pull request")
	}
	// The graph is a mirror: an open pull request has not changed it.
	if latest, _ := svc.Graph.LatestSnapshot(ctx, cs.RepositoryID); latest.ID != base.ID {
		t.Fatal("graph re-indexed before the pull request was merged")
	}

	// Syncing an open pull request changes nothing.
	if cs, _ = svc.SyncPullRequest(ctx, cs.ID); cs.Status != changeset.PROpen {
		t.Fatalf("status after sync of open PR = %s", cs.Status)
	}

	// A human merges the pull request on GitHub.
	gitCmd(t, upstream, "-c", "commit.gpgsign=false", "merge", "--no-ff", "-q", "-m", "Merge pull request #1", "covis/cs-1")
	mergeSHA := gitCmd(t, upstream, "rev-parse", "main")
	gh.prs[1].State, gh.prs[1].Merged, gh.prs[1].MergeCommitSHA = "closed", true, mergeSHA

	// Two syncs at once (e.g. two open browser tabs) record the merge once.
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := svc.SyncPullRequest(ctx, cs.ID); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	cs, _ = svc.ChangeSets.Get(ctx, cs.ID)
	if cs.Status != changeset.Merged {
		t.Fatalf("status = %s, want MERGED", cs.Status)
	}
	// The merge commit was indexed into a new snapshot; the old one is unchanged.
	after, err := svc.Graph.SnapshotByCommit(ctx, cs.RepositoryID, mergeSHA)
	if err != nil || after.Status != graphstore.SnapshotReady {
		t.Fatalf("merge commit not indexed: %+v %v", after, err)
	}
	if _, err := svc.Graph.Node(ctx, after.ID, refundKey); err != nil {
		t.Fatalf("refund missing from new snapshot: %v", err)
	}
	if _, err := svc.Graph.Node(ctx, base.ID, refundKey); !errors.Is(err, graphstore.ErrNotFound) {
		t.Fatal("old snapshot was mutated")
	}

	events, _ := svc.ChangeSets.Events(ctx, cs.ID, 0, 0)
	types := map[string]int{}
	for _, e := range events {
		types[e.Type]++
	}
	if types[changeset.EventMerged] != 1 {
		t.Errorf("merged recorded %d times", types[changeset.EventMerged])
	}
	for _, want := range []string{changeset.EventCreated, changeset.EventAgent, changeset.EventTests, changeset.EventApproved, changeset.EventPROpened, changeset.EventMerged} {
		if types[want] == 0 {
			t.Errorf("missing %s event", want)
		}
	}
}

func TestApproveRequiresGitHub(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestService(t)
	_, cs, ex := readyForReview(t, svc, "x")
	svc.PRs = nil // no GITHUB_TOKEN
	if _, err := svc.ApproveChangeSet(ctx, cs.ID, ex.DiffHash); err == nil || !strings.Contains(err.Error(), "GITHUB_TOKEN") {
		t.Fatalf("approve without GitHub: %v", err)
	}
	if cs, _ = svc.ChangeSets.Get(ctx, cs.ID); cs.Status != changeset.ReadyForReview {
		t.Fatalf("status = %s", cs.Status)
	}
}

func TestPullRequestFailureAndRetry(t *testing.T) {
	ctx := context.Background()
	svc, _, gh := newTestService(t)
	upstream, cs, ex := readyForReview(t, svc, "Add a refund method")

	gh.failNext = errors.New("github: 502 Bad Gateway")
	if _, err := svc.ApproveChangeSet(ctx, cs.ID, ex.DiffHash); err != nil {
		t.Fatal(err)
	}
	cs, _ = svc.ChangeSets.Get(ctx, cs.ID)
	if cs.Status != changeset.PRFailed || cs.ResultCommitSHA == "" {
		t.Fatalf("after failure: %+v", cs)
	}
	committed := cs.ResultCommitSHA
	if _, err := os.Stat(cs.WorktreePath); err != nil {
		t.Fatal("worktree removed after a failed pull request")
	}

	if _, err := svc.RetryPullRequest(ctx, cs.ID); err != nil {
		t.Fatal(err)
	}
	cs, _ = svc.ChangeSets.Get(ctx, cs.ID)
	if cs.Status != changeset.PROpen || cs.ResultCommitSHA != committed {
		t.Fatalf("after retry: %+v", cs)
	}
	// The retry pushed the same approved commit; it did not commit again.
	if got := gitCmd(t, upstream, "rev-parse", "covis/cs-1"); got != committed {
		t.Fatalf("branch = %s, want %s", got, committed)
	}
	if n := gitCmd(t, upstream, "rev-list", "--count", cs.BaseCommitSHA+"..covis/cs-1"); n != "1" {
		t.Fatalf("%s commits on the branch, want 1", n)
	}
	if _, err := svc.RetryPullRequest(ctx, cs.ID); err == nil {
		t.Fatal("retried an open pull request")
	}
}

func TestClosedPullRequestCanBeRevised(t *testing.T) {
	ctx := context.Background()
	svc, _, gh := newTestService(t)
	_, cs, ex := readyForReview(t, svc, "Add a refund method", serviceKey)
	if _, err := svc.ApproveChangeSet(ctx, cs.ID, ex.DiffHash); err != nil {
		t.Fatal(err)
	}
	gh.prs[1].State = "closed"
	cs, err := svc.SyncPullRequest(ctx, cs.ID)
	if err != nil || cs.Status != changeset.PRClosed {
		t.Fatalf("after close: %+v %v", cs, err)
	}
	rev, err := svc.ReviseChangeSet(ctx, cs.ID)
	if err != nil {
		t.Fatal(err)
	}
	if rev.RevisionOf == nil || *rev.RevisionOf != cs.ID || rev.RequestText != cs.RequestText || rev.Status != changeset.Proposed {
		t.Fatalf("revision = %+v", rev)
	}
}

func TestRejectCleansUpAndKeepsRecords(t *testing.T) {
	ctx := context.Background()
	svc, _, gh := newTestService(t)
	upstream, cs, _ := readyForReview(t, svc, "x")
	if _, err := svc.RejectChangeSet(ctx, cs.ID, "not needed"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(cs.WorktreePath); !os.IsNotExist(err) {
		t.Fatal("worktree kept after reject")
	}
	if ex, err := svc.ChangeSets.LatestExecution(ctx, cs.ID); err != nil || ex.Diff == "" {
		t.Fatal("execution history lost")
	}
	if _, err := svc.RunChangeSet(ctx, cs.ID); err == nil {
		t.Fatal("rejected change set could be re-run")
	}
	if _, err := svc.Git.RevParse(ctx, svc.repoDir(cs.RepositoryID), "refs/heads/"+cs.BranchName); err == nil {
		t.Fatal("branch kept after reject")
	}
	if len(gh.created) != 0 {
		t.Fatal("rejected change set opened a pull request")
	}
	if out := gitCmd(t, upstream, "branch", "--list", "covis/*"); out != "" {
		t.Fatalf("rejected change set was pushed: %s", out)
	}
}

func TestRequestIndexRecordsPendingSnapshot(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestService(t)
	repo, err := svc.ConnectRepository(ctx, upstreamFromFixture(t))
	if err != nil {
		t.Fatal(err)
	}
	svc.Queue = discardQueue{}
	if err := svc.RequestIndex(ctx, repo.ID, "deadbeef"); err != nil {
		t.Fatal(err)
	}
	latest, err := svc.Graph.LatestSnapshot(ctx, repo.ID)
	if err != nil || latest.CommitSHA != "deadbeef" || latest.Status != graphstore.SnapshotPending {
		t.Fatalf("latest snapshot = %+v, %v", latest, err)
	}
}

type discardQueue struct{}

func (discardQueue) EnqueueContext(context.Context, *asynq.Task, ...asynq.Option) (*asynq.TaskInfo, error) {
	return &asynq.TaskInfo{}, nil
}
