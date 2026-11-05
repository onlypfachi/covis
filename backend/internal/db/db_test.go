package db

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
)

// Two processes migrating a fresh database at the same time must both succeed.
func TestConcurrentMigrate(t *testing.T) {
	admin := os.Getenv("TEST_DATABASE_URL")
	if admin == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	root, err := Connect(ctx, admin)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	name := fmt.Sprintf("covis_migrate_%d", os.Getpid())
	if _, err := root.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	defer root.Exec(ctx, "DROP DATABASE "+name+" WITH (FORCE)") //nolint:errcheck

	cfg := root.Config().ConnConfig.Copy()
	url := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable", cfg.User, cfg.Password, cfg.Host, cfg.Port, name)
	var wg sync.WaitGroup
	errs := make([]error, 4)
	for i := range errs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			pool, err := Connect(ctx, url)
			if err != nil {
				errs[i] = err
				return
			}
			defer pool.Close()
			errs[i] = Migrate(pool)
		}(i)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Errorf("migrator %d: %v", i, err)
		}
	}
}
