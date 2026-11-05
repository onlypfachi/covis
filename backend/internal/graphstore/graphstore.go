// Package graphstore persists repositories and their per-commit graph
// snapshots. Snapshots are only ever written by the indexer; nothing else
// mutates graph rows.
package graphstore

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/n0/covis/backend/internal/indexer"
)

var ErrNotFound = errors.New("not found")

type Repository struct {
	ID            int       `json:"id"`
	Name          string    `json:"name"`
	CloneURL      string    `json:"cloneUrl"`
	DefaultBranch string    `json:"defaultBranch"`
	LocalPath     string    `json:"-"`
	TestCommand   string    `json:"testCommand"`
	CreatedAt     time.Time `json:"createdAt"`
}

type Snapshot struct {
	ID           int       `json:"id"`
	RepositoryID int       `json:"repositoryId"`
	CommitSHA    string    `json:"commitSha"`
	Status       string    `json:"status"`
	Error        string    `json:"error"`
	CreatedAt    time.Time `json:"createdAt"`
}

const (
	SnapshotPending  = "pending"
	SnapshotIndexing = "indexing"
	SnapshotReady    = "ready"
	SnapshotFailed   = "failed"
)

type Node struct {
	ID            int
	SnapshotID    int
	Key           string
	Kind          string
	Name          string
	QualifiedName string
	FilePath      string
	StartLine     int
	EndLine       int
	ParentKey     string
	Meta          map[string]any
}

type Edge struct {
	ID        int
	SourceKey string
	TargetKey string
	Kind      string
	FilePath  string
	Line      int
	Inferred  bool
}

type Position struct {
	Key string
	X   float64
	Y   float64
}

type Store struct{ db *pgxpool.Pool }

func New(db *pgxpool.Pool) *Store { return &Store{db: db} }

const repoCols = `id, name, clone_url, default_branch, local_path, test_command, created_at`

func scanRepo(row pgx.Row) (*Repository, error) {
	var r Repository
	err := row.Scan(&r.ID, &r.Name, &r.CloneURL, &r.DefaultBranch, &r.LocalPath, &r.TestCommand, &r.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &r, err
}

func (s *Store) CreateRepository(ctx context.Context, name, cloneURL string) (*Repository, error) {
	return scanRepo(s.db.QueryRow(ctx,
		`INSERT INTO repositories (name, clone_url) VALUES ($1, $2)
		 ON CONFLICT (clone_url) DO UPDATE SET clone_url = EXCLUDED.clone_url
		 RETURNING `+repoCols, name, cloneURL))
}

func (s *Store) Repository(ctx context.Context, id int) (*Repository, error) {
	return scanRepo(s.db.QueryRow(ctx, `SELECT `+repoCols+` FROM repositories WHERE id = $1`, id))
}

func (s *Store) Repositories(ctx context.Context) ([]*Repository, error) {
	rows, err := s.db.Query(ctx, `SELECT `+repoCols+` FROM repositories ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Repository
	for rows.Next() {
		r, err := scanRepo(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) SetRepositoryClone(ctx context.Context, id int, localPath, defaultBranch string) error {
	_, err := s.db.Exec(ctx, `UPDATE repositories SET local_path = $2, default_branch = $3 WHERE id = $1`, id, localPath, defaultBranch)
	return err
}

func (s *Store) SetTestCommand(ctx context.Context, id int, cmd string) error {
	_, err := s.db.Exec(ctx, `UPDATE repositories SET test_command = $2 WHERE id = $1`, id, cmd)
	return err
}

const snapCols = `id, repository_id, commit_sha, status, error, created_at`

func scanSnap(row pgx.Row) (*Snapshot, error) {
	var sn Snapshot
	err := row.Scan(&sn.ID, &sn.RepositoryID, &sn.CommitSHA, &sn.Status, &sn.Error, &sn.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &sn, err
}

// EnsureSnapshot returns the snapshot for (repo, sha), creating it if needed.
func (s *Store) EnsureSnapshot(ctx context.Context, repoID int, sha string) (*Snapshot, error) {
	return scanSnap(s.db.QueryRow(ctx,
		`INSERT INTO snapshots (repository_id, commit_sha) VALUES ($1, $2)
		 ON CONFLICT (repository_id, commit_sha) DO UPDATE SET commit_sha = EXCLUDED.commit_sha
		 RETURNING `+snapCols, repoID, sha))
}

func (s *Store) SetSnapshotStatus(ctx context.Context, id int, status, errMsg string) error {
	_, err := s.db.Exec(ctx, `UPDATE snapshots SET status = $2, error = $3 WHERE id = $1`, id, status, errMsg)
	return err
}

func (s *Store) Snapshot(ctx context.Context, id int) (*Snapshot, error) {
	return scanSnap(s.db.QueryRow(ctx, `SELECT `+snapCols+` FROM snapshots WHERE id = $1`, id))
}

func (s *Store) SnapshotByCommit(ctx context.Context, repoID int, sha string) (*Snapshot, error) {
	return scanSnap(s.db.QueryRow(ctx, `SELECT `+snapCols+` FROM snapshots WHERE repository_id = $1 AND commit_sha = $2`, repoID, sha))
}

// LatestSnapshot returns the most recently created snapshot, whatever its status.
func (s *Store) LatestSnapshot(ctx context.Context, repoID int) (*Snapshot, error) {
	return scanSnap(s.db.QueryRow(ctx, `SELECT `+snapCols+` FROM snapshots WHERE repository_id = $1 ORDER BY id DESC LIMIT 1`, repoID))
}

// LatestReadySnapshot returns the newest snapshot that finished indexing.
func (s *Store) LatestReadySnapshot(ctx context.Context, repoID int) (*Snapshot, error) {
	return scanSnap(s.db.QueryRow(ctx, `SELECT `+snapCols+` FROM snapshots WHERE repository_id = $1 AND status = 'ready' ORDER BY id DESC LIMIT 1`, repoID))
}

func (s *Store) Snapshots(ctx context.Context, repoID int) ([]*Snapshot, error) {
	rows, err := s.db.Query(ctx, `SELECT `+snapCols+` FROM snapshots WHERE repository_id = $1 ORDER BY id DESC`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Snapshot
	for rows.Next() {
		sn, err := scanSnap(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sn)
	}
	return out, rows.Err()
}

// ReplaceGraph atomically swaps the snapshot's nodes and edges for g.
func (s *Store) ReplaceGraph(ctx context.Context, snapshotID int, g *indexer.Graph) error {
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM edges WHERE snapshot_id = $1`, snapshotID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM nodes WHERE snapshot_id = $1`, snapshotID); err != nil {
			return err
		}
		nodeRows := make([][]any, len(g.Nodes))
		for i, n := range g.Nodes {
			meta, _ := json.Marshal(n.Meta)
			if n.Meta == nil {
				meta = []byte("{}")
			}
			nodeRows[i] = []any{snapshotID, n.Key, n.Kind, n.Name, n.QualifiedName, n.FilePath, n.StartLine, n.EndLine, n.ParentKey, meta}
		}
		if _, err := tx.CopyFrom(ctx, pgx.Identifier{"nodes"},
			[]string{"snapshot_id", "stable_key", "kind", "name", "qualified_name", "file_path", "start_line", "end_line", "parent_key", "meta"},
			pgx.CopyFromRows(nodeRows)); err != nil {
			return fmt.Errorf("copy nodes: %w", err)
		}
		edgeRows := make([][]any, len(g.Edges))
		for i, e := range g.Edges {
			edgeRows[i] = []any{snapshotID, e.Source, e.Target, e.Kind, e.FilePath, e.Line, e.Inferred}
		}
		if _, err := tx.CopyFrom(ctx, pgx.Identifier{"edges"},
			[]string{"snapshot_id", "source_key", "target_key", "kind", "file_path", "line", "inferred"},
			pgx.CopyFromRows(edgeRows)); err != nil {
			return fmt.Errorf("copy edges: %w", err)
		}
		return nil
	})
}

type GraphFilter struct {
	Kinds      []string
	PathPrefix string
	ParentKey  *string // children of this node only
	Keys       []string
	Search     string
	Limit      int
}

const nodeCols = `id, snapshot_id, stable_key, kind, name, qualified_name, file_path, start_line, end_line, parent_key, meta`

func scanNode(row pgx.Row) (*Node, error) {
	var n Node
	err := row.Scan(&n.ID, &n.SnapshotID, &n.Key, &n.Kind, &n.Name, &n.QualifiedName, &n.FilePath, &n.StartLine, &n.EndLine, &n.ParentKey, &n.Meta)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &n, err
}

// Graph returns nodes matching f and every non-containment edge touching them.
// The client decides which edges to draw based on which nodes it has loaded.
// truncated reports whether more nodes matched than the limit allowed.
func (s *Store) Graph(ctx context.Context, snapshotID int, f GraphFilter) (nodes []*Node, edges []*Edge, truncated bool, err error) {
	if f.Limit <= 0 || f.Limit > 5000 {
		f.Limit = 1500
	}
	q := `SELECT ` + nodeCols + ` FROM nodes WHERE snapshot_id = $1`
	args := []any{snapshotID}
	add := func(cond string, v any) {
		args = append(args, v)
		q += fmt.Sprintf(" AND "+cond, len(args))
	}
	if len(f.Kinds) > 0 {
		add("kind = ANY($%d)", f.Kinds)
	}
	if f.PathPrefix != "" {
		add("file_path LIKE $%d || '%%'", f.PathPrefix)
	}
	if f.ParentKey != nil {
		add("parent_key = $%d", *f.ParentKey)
	}
	if len(f.Keys) > 0 {
		add("stable_key = ANY($%d)", f.Keys)
	}
	if f.Search != "" {
		add("name ILIKE '%%' || $%d || '%%'", f.Search)
	}
	args = append(args, f.Limit+1)
	q += fmt.Sprintf(" ORDER BY stable_key LIMIT $%d", len(args))

	rows, err := s.db.Query(ctx, q, args...)
	if err != nil {
		return nil, nil, false, err
	}
	keys := []string{}
	for rows.Next() {
		n, err := scanNode(rows)
		if err != nil {
			rows.Close()
			return nil, nil, false, err
		}
		nodes = append(nodes, n)
		keys = append(keys, n.Key)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, nil, false, err
	}
	if len(nodes) > f.Limit {
		nodes, keys, truncated = nodes[:f.Limit], keys[:f.Limit], true
	}
	edges, err = s.edgesWhere(ctx, `snapshot_id = $1 AND kind <> 'contains' AND (source_key = ANY($2) OR target_key = ANY($2))`, snapshotID, keys)
	return nodes, edges, truncated, err
}

func (s *Store) edgesWhere(ctx context.Context, where string, args ...any) ([]*Edge, error) {
	rows, err := s.db.Query(ctx, `SELECT id, source_key, target_key, kind, file_path, line, inferred FROM edges WHERE `+where+` ORDER BY id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Edge
	for rows.Next() {
		var e Edge
		if err := rows.Scan(&e.ID, &e.SourceKey, &e.TargetKey, &e.Kind, &e.FilePath, &e.Line, &e.Inferred); err != nil {
			return nil, err
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}

func (s *Store) Node(ctx context.Context, snapshotID int, key string) (*Node, error) {
	return scanNode(s.db.QueryRow(ctx, `SELECT `+nodeCols+` FROM nodes WHERE snapshot_id = $1 AND stable_key = $2`, snapshotID, key))
}

func (s *Store) NodesByKeys(ctx context.Context, snapshotID int, keys []string) ([]*Node, error) {
	rows, err := s.db.Query(ctx, `SELECT `+nodeCols+` FROM nodes WHERE snapshot_id = $1 AND stable_key = ANY($2) ORDER BY stable_key`, snapshotID, keys)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Node
	for rows.Next() {
		n, err := scanNode(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// NodeEdges returns the non-containment edges into and out of key.
func (s *Store) NodeEdges(ctx context.Context, snapshotID int, key string) (incoming, outgoing []*Edge, err error) {
	all, err := s.edgesWhere(ctx, `snapshot_id = $1 AND kind <> 'contains' AND (source_key = $2 OR target_key = $2)`, snapshotID, key)
	if err != nil {
		return nil, nil, err
	}
	for _, e := range all {
		if e.SourceKey == key {
			outgoing = append(outgoing, e)
		} else {
			incoming = append(incoming, e)
		}
	}
	return incoming, outgoing, nil
}

func (s *Store) SaveLayout(ctx context.Context, repoID int, ps []Position) error {
	batch := &pgx.Batch{}
	for _, p := range ps {
		batch.Queue(`INSERT INTO canvas_layouts (repository_id, stable_key, x, y) VALUES ($1, $2, $3, $4)
			ON CONFLICT (repository_id, stable_key) DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y`, repoID, p.Key, p.X, p.Y)
	}
	return s.db.SendBatch(ctx, batch).Close()
}

func (s *Store) ClearLayout(ctx context.Context, repoID int) error {
	_, err := s.db.Exec(ctx, `DELETE FROM canvas_layouts WHERE repository_id = $1`, repoID)
	return err
}

func (s *Store) Layout(ctx context.Context, repoID int) ([]Position, error) {
	rows, err := s.db.Query(ctx, `SELECT stable_key, x, y FROM canvas_layouts WHERE repository_id = $1`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Position
	for rows.Next() {
		var p Position
		if err := rows.Scan(&p.Key, &p.X, &p.Y); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
