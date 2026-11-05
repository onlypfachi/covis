-- +goose Up
CREATE TABLE users (
  id         BIGSERIAL PRIMARY KEY,
  login      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO users (login) VALUES ('dev');

CREATE TABLE repositories (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  clone_url      TEXT NOT NULL UNIQUE,
  default_branch TEXT NOT NULL DEFAULT '',
  local_path     TEXT NOT NULL DEFAULT '',
  test_command   TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A snapshot is the graph mirror of exactly one commit. The repo is the source of truth.
CREATE TABLE snapshots (
  id            BIGSERIAL PRIMARY KEY,
  repository_id BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_sha    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  error         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (repository_id, commit_sha)
);

CREATE TABLE nodes (
  id             BIGSERIAL PRIMARY KEY,
  snapshot_id    BIGINT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  stable_key     TEXT NOT NULL,
  kind           TEXT NOT NULL,
  name           TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  file_path      TEXT NOT NULL DEFAULT '',
  start_line     INT NOT NULL DEFAULT 0,
  end_line       INT NOT NULL DEFAULT 0,
  parent_key     TEXT NOT NULL DEFAULT '',
  meta           JSONB NOT NULL DEFAULT '{}',
  UNIQUE (snapshot_id, stable_key)
);
CREATE INDEX nodes_parent_idx ON nodes (snapshot_id, parent_key);
CREATE INDEX nodes_kind_idx ON nodes (snapshot_id, kind);

CREATE TABLE edges (
  id          BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  source_key  TEXT NOT NULL,
  target_key  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  file_path   TEXT NOT NULL DEFAULT '',
  line        INT NOT NULL DEFAULT 0,
  inferred    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX edges_source_idx ON edges (snapshot_id, source_key);
CREATE INDEX edges_target_idx ON edges (snapshot_id, target_key);

-- Visual positions only; never code semantics.
CREATE TABLE canvas_layouts (
  repository_id BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  stable_key    TEXT NOT NULL,
  x             DOUBLE PRECISION NOT NULL,
  y             DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (repository_id, stable_key)
);

CREATE TABLE change_sets (
  id                   BIGSERIAL PRIMARY KEY,
  repository_id        BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  base_commit_sha      TEXT NOT NULL,
  request_text         TEXT NOT NULL,
  acceptance_criteria  TEXT NOT NULL DEFAULT '',
  selected_stable_keys TEXT[] NOT NULL DEFAULT '{}',
  status               TEXT NOT NULL,
  branch_name          TEXT NOT NULL DEFAULT '',
  worktree_path        TEXT NOT NULL DEFAULT '',
  result_commit_sha    TEXT NOT NULL DEFAULT '',
  revision_of          BIGINT REFERENCES change_sets(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The original request is immutable.
-- +goose StatementBegin
CREATE FUNCTION change_sets_request_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.request_text IS DISTINCT FROM OLD.request_text
     OR NEW.base_commit_sha IS DISTINCT FROM OLD.base_commit_sha THEN
    RAISE EXCEPTION 'change set request and base commit are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
CREATE TRIGGER change_sets_request_immutable BEFORE UPDATE ON change_sets
  FOR EACH ROW EXECUTE FUNCTION change_sets_request_immutable();

CREATE TABLE change_set_events (
  id            BIGSERIAL PRIMARY KEY,
  change_set_id BIGINT NOT NULL REFERENCES change_sets(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX change_set_events_cs_idx ON change_set_events (change_set_id, id);

CREATE TABLE executions (
  id             BIGSERIAL PRIMARY KEY,
  change_set_id  BIGINT NOT NULL REFERENCES change_sets(id) ON DELETE CASCADE,
  attempt        INT NOT NULL,
  status         TEXT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  diff           TEXT NOT NULL DEFAULT '',
  diff_hash      TEXT NOT NULL DEFAULT '',
  test_exit_code INT,
  test_output    TEXT NOT NULL DEFAULT '',
  error          TEXT NOT NULL DEFAULT '',
  UNIQUE (change_set_id, attempt)
);

-- +goose Down
DROP TABLE executions, change_set_events, change_sets, canvas_layouts, edges, nodes, snapshots, repositories, users;
DROP FUNCTION change_sets_request_immutable;
