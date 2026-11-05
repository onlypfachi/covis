package changeset

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("change set not found")

type ChangeSet struct {
	ID                 int
	RepositoryID       int
	BaseCommitSHA      string
	RequestText        string
	AcceptanceCriteria string
	SelectedKeys       []string
	Status             Status
	BranchName         string
	WorktreePath       string
	ResultCommitSHA    string
	RevisionOf         *int
	PRNumber           *int
	PRURL              string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

type Event struct {
	ID          int
	ChangeSetID int
	Type        string
	Payload     map[string]any
	CreatedAt   time.Time
}

type Execution struct {
	ID           int
	ChangeSetID  int
	Attempt      int
	Status       string
	StartedAt    time.Time
	FinishedAt   *time.Time
	Diff         string
	DiffHash     string
	TestExitCode *int
	TestOutput   string
	Error        string
}

// Event types.
const (
	EventCreated       = "created"
	EventStatusChanged = "status_changed"
	EventAgent         = "agent"
	EventTests         = "tests"
	EventApproved      = "approved"
	EventRejected      = "rejected"
	EventPROpened      = "pr_opened"
	EventMerged        = "merged" // the pull request was merged on GitHub
	EventPRClosed      = "pr_closed"
	EventError         = "error"
)

type Store struct{ db *pgxpool.Pool }

func NewStore(db *pgxpool.Pool) *Store { return &Store{db: db} }

const csCols = `id, repository_id, base_commit_sha, request_text, acceptance_criteria, selected_stable_keys,
	status, branch_name, worktree_path, result_commit_sha, revision_of, pr_number, pr_url, created_at, updated_at`

func scanCS(row pgx.Row) (*ChangeSet, error) {
	var c ChangeSet
	err := row.Scan(&c.ID, &c.RepositoryID, &c.BaseCommitSHA, &c.RequestText, &c.AcceptanceCriteria, &c.SelectedKeys,
		&c.Status, &c.BranchName, &c.WorktreePath, &c.ResultCommitSHA, &c.RevisionOf, &c.PRNumber, &c.PRURL, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &c, err
}

func (s *Store) Create(ctx context.Context, c ChangeSet) (*ChangeSet, error) {
	var out *ChangeSet
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var err error
		out, err = scanCS(tx.QueryRow(ctx,
			`INSERT INTO change_sets (repository_id, base_commit_sha, request_text, acceptance_criteria, selected_stable_keys, status, revision_of)
			 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING `+csCols,
			c.RepositoryID, c.BaseCommitSHA, c.RequestText, c.AcceptanceCriteria, c.SelectedKeys, Proposed, c.RevisionOf))
		if err != nil {
			return err
		}
		return addEvent(ctx, tx, out.ID, EventCreated, map[string]any{"status": Proposed, "baseCommit": out.BaseCommitSHA, "revisionOf": c.RevisionOf})
	})
	return out, err
}

func (s *Store) Get(ctx context.Context, id int) (*ChangeSet, error) {
	return scanCS(s.db.QueryRow(ctx, `SELECT `+csCols+` FROM change_sets WHERE id = $1`, id))
}

func (s *Store) ListByRepository(ctx context.Context, repoID int) ([]*ChangeSet, error) {
	rows, err := s.db.Query(ctx, `SELECT `+csCols+` FROM change_sets WHERE repository_id = $1 ORDER BY id DESC`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*ChangeSet
	for rows.Next() {
		c, err := scanCS(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// Transition moves a change set to `to` if the lifecycle allows it from the
// current status, recording an event. It locks the row so concurrent
// transitions are serialized. expect, when non-empty, must contain the current status.
func (s *Store) Transition(ctx context.Context, id int, to Status, payload map[string]any, expect ...Status) (*ChangeSet, error) {
	var out *ChangeSet
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var cur Status
		if err := tx.QueryRow(ctx, `SELECT status FROM change_sets WHERE id = $1 FOR UPDATE`, id).Scan(&cur); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		if len(expect) > 0 && !contains(expect, cur) {
			return &TransitionError{From: cur, To: to}
		}
		if err := Transition(cur, to); err != nil {
			return &TransitionError{From: cur, To: to}
		}
		var err error
		out, err = scanCS(tx.QueryRow(ctx, `UPDATE change_sets SET status = $2, updated_at = now() WHERE id = $1 RETURNING `+csCols, id, to))
		if err != nil {
			return err
		}
		p := map[string]any{"from": cur, "to": to}
		for k, v := range payload {
			p[k] = v
		}
		return addEvent(ctx, tx, id, EventStatusChanged, p)
	})
	return out, err
}

type TransitionError struct{ From, To Status }

func (e *TransitionError) Error() string {
	return "cannot move change set from " + string(e.From) + " to " + string(e.To)
}

func contains(ss []Status, s Status) bool {
	for _, x := range ss {
		if x == s {
			return true
		}
	}
	return false
}

func (s *Store) SetWorktree(ctx context.Context, id int, branch, path string) error {
	_, err := s.db.Exec(ctx, `UPDATE change_sets SET branch_name = $2, worktree_path = $3, updated_at = now() WHERE id = $1`, id, branch, path)
	return err
}

func (s *Store) SetPullRequest(ctx context.Context, id, number int, url string) error {
	_, err := s.db.Exec(ctx, `UPDATE change_sets SET pr_number = $2, pr_url = $3, updated_at = now() WHERE id = $1`, id, number, url)
	return err
}

func (s *Store) SetResultCommit(ctx context.Context, id int, sha string) error {
	_, err := s.db.Exec(ctx, `UPDATE change_sets SET result_commit_sha = $2, updated_at = now() WHERE id = $1`, id, sha)
	return err
}

func addEvent(ctx context.Context, q interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}, id int, typ string, payload map[string]any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `INSERT INTO change_set_events (change_set_id, type, payload) VALUES ($1, $2, $3)`, id, typ, b)
	return err
}

func (s *Store) AddEvent(ctx context.Context, id int, typ string, payload map[string]any) error {
	return addEvent(ctx, s.db, id, typ, payload)
}

// Events returns events with id > afterID, oldest first.
func (s *Store) Events(ctx context.Context, id, afterID, limit int) ([]*Event, error) {
	if limit <= 0 || limit > 1000 {
		limit = 500
	}
	rows, err := s.db.Query(ctx, `SELECT id, change_set_id, type, payload, created_at FROM change_set_events
		WHERE change_set_id = $1 AND id > $2 ORDER BY id LIMIT $3`, id, afterID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.ChangeSetID, &e.Type, &e.Payload, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}

const execCols = `id, change_set_id, attempt, status, started_at, finished_at, diff, diff_hash, test_exit_code, test_output, error`

func scanExec(row pgx.Row) (*Execution, error) {
	var e Execution
	err := row.Scan(&e.ID, &e.ChangeSetID, &e.Attempt, &e.Status, &e.StartedAt, &e.FinishedAt, &e.Diff, &e.DiffHash, &e.TestExitCode, &e.TestOutput, &e.Error)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &e, err
}

// StartExecution records a new attempt; earlier attempts are kept.
func (s *Store) StartExecution(ctx context.Context, csID int) (*Execution, error) {
	return scanExec(s.db.QueryRow(ctx,
		`INSERT INTO executions (change_set_id, attempt, status)
		 SELECT $1, COALESCE(MAX(attempt), 0) + 1, 'running' FROM executions WHERE change_set_id = $1
		 RETURNING `+execCols, csID))
}

func (s *Store) SetExecutionDiff(ctx context.Context, id int, diff, hash string) error {
	_, err := s.db.Exec(ctx, `UPDATE executions SET diff = $2, diff_hash = $3 WHERE id = $1`, id, diff, hash)
	return err
}

func (s *Store) SetExecutionTests(ctx context.Context, id int, exitCode *int, output string) error {
	_, err := s.db.Exec(ctx, `UPDATE executions SET test_exit_code = $2, test_output = $3 WHERE id = $1`, id, exitCode, output)
	return err
}

func (s *Store) FinishExecution(ctx context.Context, id int, status, errMsg string) error {
	_, err := s.db.Exec(ctx, `UPDATE executions SET status = $2, error = $3, finished_at = now() WHERE id = $1`, id, status, errMsg)
	return err
}

func (s *Store) LatestExecution(ctx context.Context, csID int) (*Execution, error) {
	return scanExec(s.db.QueryRow(ctx, `SELECT `+execCols+` FROM executions WHERE change_set_id = $1 ORDER BY attempt DESC LIMIT 1`, csID))
}

func (s *Store) Executions(ctx context.Context, csID int) ([]*Execution, error) {
	rows, err := s.db.Query(ctx, `SELECT `+execCols+` FROM executions WHERE change_set_id = $1 ORDER BY attempt DESC`, csID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Execution
	for rows.Next() {
		e, err := scanExec(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
