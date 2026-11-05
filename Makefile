SHELL := bash

# Load .env if present and export everything to child processes.
ifneq (,$(wildcard .env))
include .env
export
endif

# One absolute data dir shared by the Go worker and the agent-worker:
# the worker creates worktrees there and the agent may only edit inside them.
export DATA_DIR := $(abspath $(or $(DATA_DIR),data))
export DATABASE_URL ?= postgres://covis:covis@localhost:5435/covis?sslmode=disable
export REDIS_ADDR ?= localhost:6381
TEST_DATABASE_URL ?= postgres://covis:covis@localhost:5435/covis_test?sslmode=disable

.PHONY: up down dev api worker agent web gen test test-go test-agent e2e install check-ports

up:
	docker compose up -d
	@until docker compose exec -T postgres pg_isready -U covis >/dev/null 2>&1; do sleep 1; done
	@docker compose exec -T postgres psql -U covis -tc "SELECT 1 FROM pg_database WHERE datname='covis_test'" | grep -q 1 || \
		docker compose exec -T postgres psql -U covis -c "CREATE DATABASE covis_test" >/dev/null

down:
	docker compose down

install:
	cd agent-worker && pnpm install
	cd web && pnpm install

# Runs api, worker, agent-worker and web together. Ctrl-C stops all of them.
dev: check-ports up
	$(MAKE) -j4 api worker agent web

# Fail early instead of half-starting next to another running stack.
check-ports:
	@for p in 8787 8790 5187; do \
		if (exec 3<>/dev/tcp/127.0.0.1/$$p) 2>/dev/null; then \
			echo "port $$p is already in use: is another covis stack running?"; exit 1; \
		fi; \
	done

api:
	cd backend && env -u ANTHROPIC_API_KEY go run ./cmd/api

worker:
	cd backend && env -u ANTHROPIC_API_KEY go run ./cmd/worker

agent:
	cd agent-worker && env -u GITHUB_TOKEN -u DATABASE_URL pnpm start

web:
	cd web && pnpm dev

# Regenerate gqlgen resolvers/types and the frontend's typed documents.
gen:
	cd backend && go run github.com/99designs/gqlgen generate
	cd web && pnpm codegen

test: test-go test-agent

test-go: up
	cd backend && TEST_DATABASE_URL='$(TEST_DATABASE_URL)' go test ./...

test-agent:
	cd agent-worker && pnpm test && pnpm typecheck

# End-to-end on an isolated throwaway stack (own Redis, database, ports; fake
# agent and fake GitHub). Safe to run while `make dev` is up.
e2e:
	./scripts/e2e.sh
