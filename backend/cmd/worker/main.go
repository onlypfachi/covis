// Command worker processes background jobs: indexing commits into graph
// snapshots, running change sets through the agent, and opening pull requests
// for approved ones.
package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"

	"github.com/hibiken/asynq"

	"github.com/n0/covis/backend/internal/app"
	"github.com/n0/covis/backend/internal/config"
	"github.com/n0/covis/backend/internal/db"
)

func main() {
	if err := run(); err != nil {
		slog.Error("worker exited", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(pool); err != nil {
		return err
	}
	redis := asynq.RedisClientOpt{Addr: cfg.RedisAddr}
	queue := asynq.NewClient(redis)
	defer queue.Close()
	svc := app.New(cfg, pool, queue)

	mux := asynq.NewServeMux()
	mux.HandleFunc(app.TaskIndex, func(ctx context.Context, t *asynq.Task) error {
		var p app.IndexPayload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			return err
		}
		return svc.IndexRepository(ctx, p)
	})
	mux.HandleFunc(app.TaskExecute, func(ctx context.Context, t *asynq.Task) error {
		var p app.ChangeSetPayload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			return err
		}
		return svc.Execute(ctx, p.ChangeSetID)
	})
	mux.HandleFunc(app.TaskPullRequest, func(ctx context.Context, t *asynq.Task) error {
		var p app.ChangeSetPayload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			return err
		}
		return svc.OpenPullRequest(ctx, p.ChangeSetID)
	})

	srv := asynq.NewServer(redis, asynq.Config{Concurrency: 4, Logger: nil})
	slog.Info("worker started", "redis", cfg.RedisAddr)
	return srv.Run(mux)
}
