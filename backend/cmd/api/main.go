// Command api serves the GraphQL API. It does no expensive work inline:
// indexing, agent runs and merges are queued for the worker.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/hibiken/asynq"

	"github.com/n0/covis/backend/graph"
	"github.com/n0/covis/backend/internal/app"
	"github.com/n0/covis/backend/internal/config"
	"github.com/n0/covis/backend/internal/db"
)

func main() {
	if err := run(); err != nil {
		slog.Error("api exited", "err", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(pool); err != nil {
		return err
	}
	queue := asynq.NewClient(asynq.RedisClientOpt{Addr: cfg.RedisAddr})
	defer queue.Close()

	svc := app.New(cfg, pool, queue)
	gql := handler.New(graph.NewExecutableSchema(graph.Config{Resolvers: &graph.Resolver{App: svc}}))
	gql.AddTransport(transport.GET{})
	gql.AddTransport(transport.POST{})
	gql.Use(extension.Introspection{})

	mux := http.NewServeMux()
	mux.Handle("/graphql", gql)
	mux.Handle("/playground", playground.Handler("covis", "/graphql"))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })

	srv := &http.Server{Addr: cfg.APIAddr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	slog.Info("api listening", "addr", cfg.APIAddr)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		return err
	}
	return nil
}
