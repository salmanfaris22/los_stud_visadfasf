# Test report — 2026-10-29

**Result: all tests pass.** 6 Go test packages · 18 API integration scenarios · 22 browser (E2E) tests · type-check and production build of all 5 frontend packages.

| Suite | Tool | Tests | Result |
|---|---|---|---|
| Backend unit | `go test` | 6 packages (`apperr`, `auth`, `google`, `secure`, `service`, `server`) | ✅ pass |
| API integration (real Postgres + Redis + MinIO) | `go test ./internal/server` | 18 scenarios | ✅ 18/18 |
| Browser end-to-end | Playwright (Chromium 156) | 22 tests | ✅ 22/22 |
| Type-check | `turbo typecheck` | 5 packages | ✅ 5/5 |
| Production build | `next build` | admin 29 routes · student 29 routes | ✅ |
| Static analysis | `go vet ./...` | whole backend | ✅ clean |

## 1. Backend unit tests

| Package | What is checked | Result |
|---|---|---|
| `platform/secure` | argon2id hash/verify, salting, AES-GCM tamper + wrong-key rejection, token/code randomness | ✅ |
| `auth` | JWT issue/parse, wrong secret, expired token, permission checks, mentor scope, super admin, catalogue | ✅ |
| `apperr` | Postgres error mapping (no rows → 404, unique → 409, FK → 409, check → 422) | ✅ |
| `platform/google` | OAuth state HMAC, tampering, expiry, Meet code parsing | ✅ |
| `service` | Video link parser (18 cases, 4 providers), embeds, ICS building + line folding, Google Calendar link, quiz scoring (6 cases), quiz validation, slugify, CSV injection guard, link/Drive validation | ✅ |

## 2. API integration scenarios (`internal/server/api_test.go`)

| # | Scenario | Key assertions | Result |
|---|---|---|---|
| 1 | Health | DB/Redis/storage ok | ✅ |
| 2 | Admin login | Case-insensitive email, super admin, wrong password → 401 | ✅ |
| 3 | Course → Vimeo video → task | Unique slugs (`-2`), wrong-provider link → 422, pass > max marks → 422, curriculum | ✅ |
| 4 | Batch types & batches | Duplicate type → 409, end before start → 422 | ✅ |
| 5 | Student + enrollment | `STU` code, duplicate email → 409, search | ✅ |
| 6 | Portal rules | Staff blocked on student portal (403), students blocked from admin API, raw video URL hidden | ✅ |
| 7 | Submit & review | Disallowed type / non-Drive link / `javascript:` link → 422, resubmit while pending → 409, marks over max / below pass on approve → 422, thread comment | ✅ |
| 8 | Certificate | Auto-issued at 100%, public verify, PDF download, progress 100%, notifications | ✅ |
| 9 | Scoped mentor role | Sees 0 courses until assigned, 403 on staff/other course/delete student, then sees course + its students | ✅ |
| 10 | CSRF | Cookie write without `X-LMS-App` refused | ✅ |
| 11 | Refresh tokens | Rotation works; reusing an old token → 401 and all sessions revoked | ✅ |
| 12 | Live session | `http://` Meet link → 422, audience roster, student sees it, early join → 422, `.ics` content, Sync without Google reports clearly, attendance, reminder due | ✅ |
| 13 | Quiz | Correct answers never sent to students, multi-answer scoring, attempt limit → 409 | ✅ |
| 14 | Announcements, Q&A, leads | Course audience, threaded reply, public lead + course page with preview | ✅ |
| 15 | CSV import/export | 2 created, 1 skipped, 1 error; formula injection neutralised | ✅ |
| 16 | Uploads | 3 MB image → 422, student thumbnail → 403, `.exe` → 422, direct PUT + size check, signed owner download, anonymous → 403 | ✅ |
| 17 | Cascade + audit | Task delete removes its submissions, audit entries written | ✅ |
| 18 | Rate limit | 429 after repeated failed logins | ✅ |

## 3. Browser end-to-end tests (Playwright)

| # | Spec | Test | Result |
|---|---|---|---|
| 1 | Public site | Landing: CMS hero, stats, courses, how it works, FAQ | ✅ |
| 2 | Public site | Catalog search → course page → free-preview YouTube player | ✅ |
| 3 | Public site | Enquiry form creates a lead | ✅ |
| 4 | Public site | Blog post, sitemap, invalid certificate, API health | ✅ |
| 5 | Auth | Wrong password message | ✅ |
| 6 | Auth | Student blocked from admin portal | ✅ |
| 7 | Auth | Protected pages redirect to login | ✅ |
| 8 | Auth | Self sign-up → empty learning home | ✅ |
| 9 | Auth | Admin sign in / sign out | ✅ |
| 10 | Admin | Dashboard stats, chart, review queue | ✅ |
| 11 | Admin | New course → Vimeo video with live preview → task | ✅ |
| 12 | Admin | Create student with course assigned | ✅ |
| 13 | Admin | Roles matrix; new role auto-adds `view` | ✅ |
| 14 | Admin | Review queue, live calendar, CMS editor, settings | ✅ |
| 15 | Journey | Assigned course → watch (watermark) → submit text + link → chat → mentor approves 9/10 → 100% → certificate → verify page | ✅ |
| 16 | Quiz / Q&A / Live | Quiz 100% passed, Q&A comment, live class + Google Calendar link, calendar | ✅ |
| 17 | Mentor scope | Only assigned course, admin-only menus hidden, API 403 | ✅ |
| 18 | Phone (390 px) | Public pages: no sideways scroll | ✅ |
| 19 | Phone (390 px) | Student portal bottom navigation | ✅ |
| 20 | Phone (390 px) | Admin menu drawer | ✅ |
| 21 | Theme | Light/dark toggle persists | ✅ |
| 22 | Screenshots | 13 screens captured to `docs/screenshots/` | ✅ |

## 4. Bugs found by testing and fixed

| # | Bug | Found by | Fix |
|---|---|---|---|
| 1 | `.ics` continuation lines were 76 bytes (calendar spec max 75) | Unit test | Continuation lines carry 74 chars + leading space |
| 2 | Lists did not refresh after adding a video/task/class/quiz until page reload | E2E #11 | `invalidatePaths()` now matches templated **and** filled-in query paths |
| 3 | Form labels not linked to inputs (accessibility) | E2E selectors | `Field` links its label to the control automatically |
| 4 | CMS editor labels not linked | E2E #14 | Controls forward the `id` |
| 5 | Notification badge covered the bell icon | Screenshot review | Tailwind now scans `packages/shared` |
| 6 | Disabled Previous/Next buttons stacked icon over text | Screenshot review | Disabled state renders a plain button |
| 7 | Theme toggle could pick the wrong theme if clicked before hydration | E2E #21 | Click uses the resolved theme |
| 8 | Closing the task dropdown crashed the page ("destroy is not a function"): new Chrome returns a Promise from `scrollIntoView`, which a brace-less `useEffect` handed to React as a cleanup | E2E journey (task dropdown) | Effects use block bodies; all similar effects fixed |
| 9 | Test runs left courses/students in the demo data, pushing real courses off the home page | E2E landing | Playwright global teardown deletes test data by name pattern |

## 5. How to re-run

```bash
make services                 # Postgres, Redis, MinIO, Mailpit
cd backend && go test ./... -count=1          # unit + integration (lms_test DB)
make api & make dev           # API :8080, student :3000, admin :3001
pnpm --filter @lms/e2e test   # browser tests (report: e2e/playwright-report)
```

Note: this network blocks `cdn.playwright.dev`. Chromium was installed by hand from the Chrome for Testing bucket into `~/Library/Caches/ms-playwright/chromium_headless_shell-1248`.
