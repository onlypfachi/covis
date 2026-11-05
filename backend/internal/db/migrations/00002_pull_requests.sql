-- +goose Up
-- Approved change sets become pull requests; nothing is merged locally.
ALTER TABLE change_sets
  ADD COLUMN pr_number INT,
  ADD COLUMN pr_url    TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE change_sets DROP COLUMN pr_number, DROP COLUMN pr_url;
