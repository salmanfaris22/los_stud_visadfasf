# LMS — Learning & Student Management System

A YouTube / Udemy-style learning platform: **Go + PostgreSQL backend, two Next.js frontends** (admin & staff portal, student portal with an animated public website).

Admins create students and assign courses. Courses are **videos** (YouTube / Vimeo / Bunny Stream / Cloudflare Stream) with **tasks under each video**. Students submit work (files, images ≤ 2 MB, text, links, Google Drive links, code), mentors approve, reject or ask for a resubmission, and when every task is approved the student gets a **verifiable PDF certificate**. There are also live Google Meet classes with a sync button, online and offline batches with QR attendance, quizzes, video Q&A, announcements, a CMS-driven landing page, leads, a blog, analytics, an audit log and a full role/permission matrix.

| | |
|---|---|
| Backend | Go 1.27 · `net/http` + chi · huma (OpenAPI 3.1) · sqlc + pgx v5 · golang-migrate |
| Data | PostgreSQL 16 · Redis (rate limits, realtime fan-out, WS tickets) · S3-compatible storage (Cloudflare R2 / MinIO) |
| Frontends | Next.js 15 (App Router) · React 19 · Tailwind v4 · shadcn-style UI · TanStack Query · Framer Motion |
| Monorepo | pnpm workspaces + Turborepo |
| Quality | Go unit + API integration tests · Playwright E2E · GitHub Actions CI |

## Quick start (macOS, Homebrew)

```bash
brew install go pnpm sqlc golang-migrate postgresql@16 redis minio mailpit
make services db install        # start Postgres/Redis/MinIO/Mailpit, create DBs, install packages
cp .env.example backend/.env    # defaults work locally
make seed                       # roles, super admin, website content + demo data
make api                        # API  → http://localhost:8080  (docs: /docs)
make dev                        # apps → student http://localhost:3000 · admin http://localhost:3001
```

Or with Docker: `docker compose up -d --build`, then `docker compose run --rm api /app/seed -demo`.

### Demo accounts

| Portal | Email | Password | Role |
|---|---|---|---|
| Admin `:3001` | admin@lms.local | Admin@12345 | Super admin |
| Admin `:3001` | mentor@lms.local | Mentor@12345 | Mentor (scoped to *Go Backend Mastery*) |
| Student `:3000` | student@lms.local | Student@12345 | Student (also `priya@`, `rahul@`) |

Local tools: Mailpit inbox http://localhost:8025 · MinIO console http://localhost:9001 (minioadmin/minioadmin) · pgAdmin: import `docs/pgadmin-servers.json` (password `lms`).

## Repository layout

```
LMS/
├── backend/                 Go API
│   ├── cmd/                 api · migrate · seed · openapi
│   ├── db/                  migrations/*.sql · queries/*.sql (sqlc input) · embed.go
│   ├── api/openapi.json     generated spec
│   └── internal/
│       ├── handler/         HTTP layer — routes, params, error → status (no business rules)
│       ├── service/         business logic (one file per domain), no HTTP imports
│       ├── repository/      sqlc-generated data access (do not edit)
│       ├── dto/             request / response models shared by handler + service
│       ├── middleware/      authentication, permission guards, rate limit, CORS, logging
│       ├── auth/            principal, permission catalogue, JWT, cookies
│       ├── apperr/          typed errors returned by services
│       ├── platform/        adapters: storage, mailer, realtime, google, secure
│       ├── jobs/            scheduler (live reminders, token cleanup)
│       ├── config/          environment configuration
│       └── server/          wiring + API integration tests
├── frontend/                pnpm + Turborepo workspace (run pnpm commands here)
│   ├── apps/
│   │   ├── admin/           Next.js admin & staff portal (:3001)
│   │   └── student/         Next.js public website + student portal (:3000)
│   ├── packages/
│   │   ├── ui/              design system (buttons, dialogs, video player, markdown, calendar…)
│   │   ├── api-client/      typed API client (Connect/gRPC + OpenAPI) + upload/realtime helpers
│   │   ├── shared/          components needing API + UI (notification bell, image upload)
│   │   └── config/          shared tsconfig
│   ├── e2e/                 Playwright browser tests
│   └── Dockerfile           builds one app: --build-arg APP=admin|student
├── proto/                   shared .proto contract (Go, web, mobile) · buf.yaml/buf.gen.yaml at root
└── docs/                    architecture, API, setup, features, test report
```

## Documentation

| Doc | What's inside |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, request flow, data model, auth, permissions, uploads, live sync, realtime |
| [docs/API.md](docs/API.md) | All 147 endpoints with the permission each needs |
| [docs/FEATURES.md](docs/FEATURES.md) | Every feature per role, with the page and API behind it |
| [docs/SETUP.md](docs/SETUP.md) | Local setup, environment variables, Google, Cloudflare R2, production deploy |
| [docs/TEST_REPORT.md](docs/TEST_REPORT.md) | Full test results in tables |

## Common commands

| Command | Does |
|---|---|
| `make test` | Go unit + API integration tests (uses `lms_test` DB) |
| `make e2e` | Playwright tests (API + both apps running) |
| `make gen` | Regenerate OpenAPI + TypeScript client after API changes |
| `make proto` | Regenerate Go + TypeScript code from `proto/` |
| `make sqlc` | Regenerate repository code after editing `db/queries/*.sql` |
| `cd frontend && pnpm typecheck` / `pnpm build` | Type-check / build all frontend packages |
