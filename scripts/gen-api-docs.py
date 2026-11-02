#!/usr/bin/env python3
"""Builds docs/API.md from the handler route definitions (method, path, access rule, summary)."""
import glob, re, os, collections

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import json
spec = json.load(open(os.path.join(root, "backend/api/openapi.json")))
src = "".join(open(f).read() for f in sorted(glob.glob(os.path.join(root, "backend/internal/handler/*.go"))))
guard_re = re.compile(r'op\("([\w-]+)",[^\n]*')

def access_for(opid):
    m = re.search(r'op\("' + re.escape(opid) + r'",[^\n]*', src)
    if not m:
        return "public"
    line = m.group(0)
    out = []
    for name, args in re.findall(r'g\.(\w+)\(([^)]*)\)', line):
        if name == "Perm":
            out.append("`" + ":".join(a.strip().strip('"') for a in args.split(",")) + "`")
        elif name == "RateLimit":
            a = [x.strip().strip('"') for x in args.split(",")]
            out.append(f"rate {a[1]}/{a[2].replace('time.', '').replace('*', '×')}")
        else:
            out.append({"Auth": "signed in", "Staff": "staff", "Student": "student"}.get(name, name))
    return " · ".join(out) or "public"

groups = collections.OrderedDict()
order = ["Auth", "Staff & roles", "Students", "Courses", "Curriculum", "Batches", "Attendance", "Task reviews", "Uploads", "Quizzes", "Certificates",
         "Live sessions", "Announcements", "Video Q&A", "Notifications", "Student portal", "Public website", "Website admin", "Admin"]
rows = []
for route, item in spec["paths"].items():
    for method, op in item.items():
        if method not in ("get", "post", "put", "delete", "patch"):
            continue
        rows.append((op["tags"][0], method.upper(), route, access_for(op["operationId"]), op.get("summary", "")))
for g in order:
    groups[g] = [(m, p, a, s) for (t, m, p, a, s) in rows if t == g]
for (t, m, p, a, s) in rows:
    if t not in groups:
        groups.setdefault(t, []).append((m, p, a, s))
groups = collections.OrderedDict((k, v) for k, v in groups.items() if v)
total = sum(len(v) for v in groups.values())
out = ["# API reference", "", f"Generated from `backend/internal/handler/*.go` by `scripts/gen-api-docs.py` — **{total} JSON endpoints** in {len(groups)} groups.",
       "Interactive docs: run the API and open **http://localhost:8080/docs** (OpenAPI 3.1 at `/openapi.json`).", "",
       "Every request sends `X-LMS-App: admin|student`. Auth uses httpOnly cookies (`lms_<app>_at` 15 min, `lms_<app>_rt` 7 days).",
       "Access column: `module:action` = staff permission from roles (super admins pass everything) · *student* = student account · *signed in* = any user.", "",
       "| Group | Endpoints |", "|---|---|"]
out += [f"| [{g}](#{re.sub(r'[^a-z0-9 -]', '', g.lower()).replace(' ', '-')}) | {len(v)} |" for g, v in groups.items()]
for g, rows in groups.items():
    out += ["", f"## {g}", "", "| Method | Path | Access | What it does |", "|---|---|---|---|"]
    out += [f"| `{m}` | `{p}` | {a} | {s} |" for m, p, a, s in rows]
out += ["", "## Non-JSON routes", "", "| Method | Path | What it does |", "|---|---|---|",
        "| `GET` | `/healthz` | DB / Redis / storage health |",
        "| `GET` | `/ws?ticket=…` | Realtime WebSocket (ticket from `POST /api/v1/ws/ticket`) |",
        "| `GET` | `/api/v1/files/{id}` | Access-checked redirect to a signed download URL |",
        "| `GET` | `/api/v1/auth/google/start?app=` | Google sign-in redirect |",
        "| `GET` | `/api/v1/auth/google/callback` | Google sign-in callback |",
        "| `GET` | `/api/v1/settings/google/connect` | Connect institute Google account (Calendar/Meet/Drive) |",
        "| `GET` | `/api/v1/settings/google/callback` | Google connect callback |",
        "| `GET` | `/docs` · `/openapi.json` | Interactive API docs and spec |"]
open(os.path.join(root, "docs/API.md"), "w").write("\n".join(out) + "\n")
print(f"docs/API.md: {total} endpoints, {len(groups)} groups")
