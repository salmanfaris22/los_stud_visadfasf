"use client";
import * as React from "react";
import { Lock, Plus, Shield, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { type PermissionCatalog, type RoleInput, StaffService, useRpcMutation, useRpcQuery, type Draft } from "@lms/api-client";
import { Badge, Button, Card, CardContent, Checkbox, EmptyState, Field, Input, PageHeader, Skeleton, Switch, cn, useConfirm } from "@lms/ui";

import { feedback } from "@/lib/feedback";
import { useSession } from "@/lib/session";

type Perms = Record<string, string[]>;
type PermLists = Record<string, { values: string[] }>;
const toPerms = (p: PermLists): Perms => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.values]));
const fromPerms = (p: Perms): PermLists => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { values: v }]));

/** Modules × actions checkbox grid with row/column toggles. */
function Matrix({ catalog, value, onChange, disabled }: { catalog: PermissionCatalog; value: Perms; onChange: (p: Perms) => void; disabled?: boolean }) {
  const has = (m: string, a: string) => value[m]?.includes(a) ?? false;
  const set = (m: string, a: string, on: boolean) => {
    const cur = new Set(value[m] ?? []);
    if (on) { cur.add(a); if (a !== "view") cur.add("view"); } else { cur.delete(a); if (a === "view") cur.clear(); }
    onChange({ ...value, [m]: [...cur] });
  };
  const row = (m: string, on: boolean) => onChange({ ...value, [m]: on ? [...catalog.actions] : [] });
  const col = (a: string, on: boolean) => {
    const next = { ...value };
    catalog.modules.forEach((m) => { const cur = new Set(next[m.key] ?? []); if (on) { cur.add(a); cur.add("view"); } else cur.delete(a); next[m.key] = [...cur]; });
    onChange(next);
  };
  let group = "";
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="p-3 text-left font-medium">Module</th>
            {catalog.actions.map((a) => (
              <th key={a} className="p-3 text-center font-medium capitalize">
                <div className="flex flex-col items-center gap-1">{a}<Checkbox disabled={disabled} checked={catalog.modules.every((m) => has(m.key, a))} onCheckedChange={(v) => col(a, !!v)} aria-label={`All ${a}`} /></div>
              </th>
            ))}
            <th className="p-3 text-center font-medium">All</th>
          </tr>
        </thead>
        <tbody>
          {catalog.modules.map((m) => {
            const header = m.group !== group ? ((group = m.group), <tr key={"g" + m.group}><td colSpan={catalog.actions.length + 2} className="bg-muted/40 px-3 py-2 text-xs font-bold text-muted-foreground">{m.group}</td></tr>) : null;
            const full = catalog.actions.every((a) => has(m.key, a));
            return (
              <React.Fragment key={m.key}>
                {header}
                <tr className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-3">{m.label}</td>
                  {catalog.actions.map((a) => <td key={a} className="p-3 text-center"><Checkbox disabled={disabled} checked={has(m.key, a)} onCheckedChange={(v) => set(m.key, a, !!v)} aria-label={`${m.label} ${a}`} /></td>)}
                  <td className="p-3 text-center"><Checkbox disabled={disabled} checked={full ? true : (value[m.key]?.length ? "indeterminate" : false)} onCheckedChange={(v) => row(m.key, !!v)} aria-label={`All ${m.label}`} /></td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function RolesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const catalog = useRpcQuery(StaffService.method.getPermissionCatalog, {}, { select: (r) => r.catalog });
  const roles = useRpcQuery(StaffService.method.listRoles, {}, { select: (r) => r.items });
  const [selected, setSelected] = React.useState<string | "new" | null>(null);
  const [f, setF] = React.useState<Draft<RoleInput>>({ name: "", description: "", scoped: false, salesScope: "", permissions: {} });
  const role = roles.data?.find((r) => r.id === selected);
  React.useEffect(() => {
    if (selected === "new") setF({ name: "", description: "", scoped: false, salesScope: "", permissions: {} });
    else if (role) setF({ name: role.name, description: role.description, scoped: role.scoped, salesScope: role.salesScope, permissions: fromPerms(toPerms(role.permissions)) });
  }, [selected, role]);
  React.useEffect(() => { if (!selected && roles.data?.length) setSelected(roles.data[0]!.id); }, [roles.data, selected]);
  const create = useRpcMutation(StaffService.method.createRole, feedback(qc, "Role created", [StaffService], (r) => setSelected(r.role?.id ?? null)));
  const update = useRpcMutation(StaffService.method.updateRole, feedback(qc, "Role saved — applies within 30 seconds", [StaffService]));
  const del = useRpcMutation(StaffService.method.deleteRole, feedback(qc, "Role deleted", [StaffService], () => setSelected(null)));
  const editable = selected === "new" ? can("roles", "create") : can("roles", "edit");

  return (
    <>
      <PageHeader title="Roles & permissions" description="Decide exactly who can view, create, edit and delete each area." actions={can("roles", "create") && <Button onClick={() => setSelected("new")}><Plus /> New role</Button>} />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {roles.isLoading && <Skeleton className="h-40" />}
          {roles.data?.map((r) => (
            <button key={r.id} onClick={() => setSelected(r.id)} className={cn("w-full rounded-xl border p-3 text-left transition", selected === r.id ? "border-foreground bg-signal/15" : "hover:bg-muted/40")}>
              <div className="flex items-center gap-2 font-medium">{r.isSystem ? <Lock className="size-3.5 text-muted-foreground" /> : <Shield className="size-3.5 text-primary" />}{r.name}{r.scoped && <Badge variant="info" className="ml-auto">scoped</Badge>}</div>
              <div className="mt-1 text-xs text-muted-foreground">{r.userCount} users · {Object.values(r.permissions).flat().length} permissions</div>
            </button>
          ))}
        </div>
        {selected ? (
          <Card>
            <CardContent className="space-y-5 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!editable} /></Field>
                <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} disabled={!editable} /></Field>
              </div>
              <label className="flex items-center justify-between rounded-xl border p-3 text-sm">
                <span><span className="font-medium">Only assigned courses & batches</span><span className="block text-xs text-muted-foreground">For mentors: they only see students, submissions and live sessions of courses/batches they are assigned to.</span></span>
                <Switch checked={f.scoped} onCheckedChange={(v) => setF({ ...f, scoped: v })} disabled={!editable} />
              </label>
              {catalog.data && <Matrix catalog={catalog.data} value={toPerms(f.permissions)} onChange={(p) => setF({ ...f, permissions: fromPerms(p) })} disabled={!editable} />}
              <div className="flex gap-2">
                {editable && <Button loading={create.isPending || update.isPending} onClick={() => (selected === "new" ? create.mutate({ input: f }) : update.mutate({ id: selected, input: f }))}>Save role</Button>}
                {role && !role.isSystem && can("roles", "delete") && (
                  <Button variant="outline" className="text-destructive" onClick={async () => { if (await confirm({ title: `Delete role ${role.name}?`, description: `${role.userCount} users lose these permissions.`, destructive: true, confirmText: "Delete" })) del.mutate({ id: role.id }); }}><Trash2 /> Delete</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : <EmptyState icon={<Shield />} title="Pick a role" />}
      </div>
    </>
  );
}
