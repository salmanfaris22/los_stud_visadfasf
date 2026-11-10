# LMS developer commands. Run `make help`.
SHELL := /bin/bash
export PATH := /opt/homebrew/opt/postgresql@16/bin:$(PATH)

help: ## Show commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

services: ## Start Postgres, MinIO, Mailpit (Homebrew services)
	brew services start postgresql@16; brew services start minio; brew services start mailpit

db: ## Create the lms and lms_test databases (first time)
	psql -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='lms'" | grep -q 1 || psql -d postgres -c "CREATE ROLE lms LOGIN PASSWORD 'lms' CREATEDB"
	psql -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='lms'" | grep -q 1 || createdb -O lms lms
	psql -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='lms_test'" | grep -q 1 || createdb -O lms lms_test

install: ## Install Node packages and Go modules
	cd frontend && pnpm install
	cd backend && go mod download

migrate: ## Apply database migrations
	cd backend && go run ./cmd/migrate up

seed: ## Roles, super admin, batch types, website content + demo data
	cd backend && go run ./cmd/seed -demo

sqlc: ## Regenerate the repository layer from SQL
	cd backend && sqlc generate

api: ## Run the Go API on :8080
	cd backend && go run ./cmd/api

gen: ## Regenerate the protos from internal/dto + backend/tools/rpcgen/spec.txt, then all code and docs/API.md
	cd backend && go run ./tools/protogen && go run ./tools/rpcgen
	$(MAKE) proto
	python3 scripts/gen-api-docs.py

proto: ## Regenerate Go + TypeScript code from proto/ (buf)
	PATH="$(CURDIR)/frontend/node_modules/.bin:$$PATH" buf generate

dev: ## Run admin (:3001) and student (:3000) apps
	cd frontend && pnpm dev

build: ## Build backend binary and both apps
	cd backend && go build -o bin/api ./cmd/api
	cd frontend && pnpm build

test: ## Go unit + integration tests
	cd backend && go test ./... -count=1

e2e: ## Playwright browser tests (apps + API must be running)
	cd frontend && pnpm --filter @lms/e2e test

up: ## Docker: full stack
	docker compose up -d --build

.PHONY: help services db install migrate seed sqlc api gen proto dev build test e2e up
