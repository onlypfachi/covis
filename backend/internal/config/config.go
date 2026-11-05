// Package config loads process configuration from the environment and fails
// fast when required values are missing.
package config

import (
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	DatabaseURL    string
	RedisAddr      string
	DataDir        string
	APIAddr        string
	AgentWorkerURL string
	GitHubToken    string
	GitHubAPIURL   string
}

func Load() (Config, error) {
	c := Config{
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		RedisAddr:      envOr("REDIS_ADDR", "localhost:6381"),
		DataDir:        envOr("DATA_DIR", "./data"),
		APIAddr:        envOr("API_ADDR", ":8787"),
		AgentWorkerURL: envOr("AGENT_WORKER_URL", "http://localhost:8790"),
		GitHubToken:    os.Getenv("GITHUB_TOKEN"),
		GitHubAPIURL:   envOr("GITHUB_API_URL", "https://api.github.com"),
	}
	if c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL is required")
	}
	abs, err := filepath.Abs(c.DataDir)
	if err != nil {
		return c, fmt.Errorf("resolve DATA_DIR: %w", err)
	}
	c.DataDir = abs
	return c, nil
}

func (c Config) ReposDir() string     { return filepath.Join(c.DataDir, "repos") }
func (c Config) WorktreesDir() string { return filepath.Join(c.DataDir, "worktrees") }

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
