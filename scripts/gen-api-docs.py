#!/usr/bin/env python3
"""Builds docs/API.md from the gRPC contract in proto/lms/v1 (services, RPCs, access rules)."""
import glob, os, re

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
services = []
for path in sorted(glob.glob(os.path.join(root, "proto/lms/v1/*.proto"))):
    text = open(path).read()
    for m in re.finditer(r"((?://[^\n]*\n)*)service (\w+) \{(.*?)\n\}", text, re.S):
        doc = " ".join(l.strip()[2:].strip() for l in m.group(1).strip().split("\n") if l.strip())
        rpcs = []
        for r in re.finditer(r"((?:\s*//[^\n]*\n)*)\s*rpc (\w+)\((\w+)\) returns \((stream )?(\w+)\) \{(.*?)\n  \}", m.group(3), re.S):
            summary = " ".join(l.strip()[2:].strip() for l in r.group(1).strip().split("\n") if l.strip())
            body = r.group(6)
            acc = re.search(r"\(lms\.v1\.access\) = \{(.*?)\};", body, re.S)
            a = " ".join(acc.group(1).split()) if acc else ""
            if "perm:" in a:
                pm = re.search(r'module: "(\w+)"\s*,?\s*action: "(\w+)"', a)
                who = f"`{pm.group(1)}:{pm.group(2)}`"
            elif "public: true" in a: who = "public"
            elif "signed_in: true" in a: who = "signed in"
            elif "student: true" in a: who = "student"
            elif "staff: true" in a: who = "staff"
            else: who = "?"
            rl = re.search(r'bucket: "(\w+)"\s*,?\s*limit: (\d+)\s*,?\s*window_seconds: (\d+)', a)
            if rl: who += f" · {rl.group(2)}/{int(rl.group(3)) // 60 or 1} min" if int(rl.group(3)) >= 60 else ""
            kind = "stream" if r.group(4) else ("read" if "NO_SIDE_EFFECTS" in body else "write")
            rpcs.append((r.group(2), kind, who, summary))
        services.append((m.group(2), doc, rpcs))

total = sum(len(r) for _, _, r in services)
out = [
    "# API reference",
    "",
    f"The LMS API is gRPC only: **{len(services)} services, {total} RPCs**, served by one Go server on `:8080` that speaks gRPC, gRPC-Web and the Connect protocol (JSON or binary).",
    "The contract is `proto/lms/v1/*.proto` (generated from `backend/internal/dto` and `backend/tools/rpcgen/spec.txt` with `make gen`).",
    "",
    "| How to call | Detail |",
    "|---|---|",
    "| Path | `POST /lms.v1.<Service>/<Method>` (web apps: `/rpc/lms.v1.<Service>/<Method>` through Next.js). Read RPCs also accept Connect `GET`. |",
    "| Body | Connect JSON (field names in camelCase or snake_case) or protobuf binary. |",
    "| Auth | Web: httpOnly cookies from `AuthService.Login` plus header `X-LMS-App: admin\\|student`. |",
    "| Errors | Connect codes: `invalid_argument` 400, `unauthenticated` 401, `permission_denied` 403, `not_found` 404, `already_exists` 409, `resource_exhausted` 429. |",
    "| Explore | `grpcurl -plaintext localhost:8080 list` (server reflection) |",
    "| Plain HTTP | `/healthz`, `/api/v1/auth/google/{start,callback}`, `/api/v1/settings/google/{connect,callback}`, `/api/v1/files/{id}` |",
    "",
    "Access: **public** = anyone · **signed in** = any user · **student** / **staff** = that kind of user · `module:action` = staff with that permission (super admins always pass).",
    "",
]
for name, doc, rpcs in services:
    out += [f"## {name}", "", doc, "", "| RPC | Kind | Access | What it does |", "|---|---|---|---|"]
    out += [f"| `{n}` | {k} | {w} | {s} |" for n, k, w, s in rpcs]
    out.append("")
open(os.path.join(root, "docs/API.md"), "w").write("\n".join(out))
print(f"docs/API.md: {len(services)} services, {total} RPCs")
