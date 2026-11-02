"use client";
import * as React from "react";
import { Crown, Pencil, Plus, Trash2, UserCog } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@lms/api-client";
import {
  Avatar, Badge, Button, Card, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Field, Input, MultiSelect, PageHeader,
  Pagination, SearchInput, Select, Skeleton, StatusBadge, Switch, TBody, TD, TH, THead, TR, Table, timeAgo, useConfirm,
} from "@lms/ui";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { Can, useSession } from "@/lib/session";

function StaffDialog({ open, onOpenChange, staffId }: { open: boolean; onOpenChange: (o: boolean) => void; staffId?: string }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const roles = $api.useQuery("get", "/api/v1/roles", {}, { enabled: open });
  const existing = $api.useQuery("get", "/api/v1/staff/{id}", { params: { path: { id: staffId ?? "" } } }, { enabled: open && !!staffId });
  const [f, setF] = React.useState<Schemas["StaffInput"]>({ name: "", email: "", phone: "", password: "", status: "active", is_super_admin: false, role_ids: [] });
  React.useEffect(() => {
    if (!open) return;
    const s = existing.data;
    if (staffId && !s) return;
    setF({ name: s?.name ?? "", email: s?.email ?? "", phone: s?.phone ?? "", password: "", status: (s?.status as "active") ?? "active", is_super_admin: s?.is_super_admin ?? false, role_ids: s?.roles.map((r) => r.id) ?? [] });
  }, [open, staffId, existing.data]);
  const create = $api.useMutation("post", "/api/v1/staff", feedback(qc, "Staff user created", ["/api/v1/staff"], () => onOpenChange(false)));
  const update = $api.useMutation("put", "/api/v1/staff/{id}", feedback(qc, "Staff user saved", ["/api/v1/staff"], () => onOpenChange(false)));
  const body = { ...f, password: f.password || undefined, phone: f.phone || undefined };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{staffId ? "Edit staff user" : "Add staff user"}</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (staffId) update.mutate({ params: { path: { id: staffId } }, body }); else create.mutate({ body }); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Email" required><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Password" hint={staffId ? "Leave empty to keep" : "Leave empty to email an invite"}><Input type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
          </div>
          <Field label="Roles" hint="Permissions come from roles. A 'scoped' role limits the user to assigned courses and batches.">
            <MultiSelect value={f.role_ids} onChange={(v) => setF({ ...f, role_ids: v })} options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name, hint: r.scoped ? "scoped" : "" }))} placeholder="Choose roles" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {staffId && <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as "active" })}><option value="active">Active</option><option value="disabled">Disabled</option></Select></Field>}
            {me?.is_super_admin && (
              <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span><span className="font-medium">Super admin</span><span className="block text-xs text-muted-foreground">Full access, ignores roles</span></span>
                <Switch checked={f.is_super_admin} onCheckedChange={(v) => setF({ ...f, is_super_admin: v })} />
              </label>
            )}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={create.isPending || update.isPending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function StaffPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { me } = useSession();
  const [q, setQ] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [edit, setEdit] = React.useState<{ id?: string } | null>(null);
  const roles = $api.useQuery("get", "/api/v1/roles");
  const list = $api.useQuery("get", "/api/v1/staff", { params: { query: { q: q || undefined, role_id: roleId || undefined, page } } });
  const del = $api.useMutation("delete", "/api/v1/staff/{id}", feedback(qc, "Staff user deleted", ["/api/v1/staff"]));
  return (
    <>
      <PageHeader title="Staff" description="Admins, mentors and other team members." actions={<Can module="users" action="create"><Button onClick={() => setEdit({})}><Plus /> Add staff</Button></Can>} />
      <Card className="p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or email…" />
          <Select value={roleId} onChange={(e) => { setRoleId(e.target.value); setPage(1); }}><option value="">All roles</option>{roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        </div>
        {list.isLoading ? <Skeleton className="h-64" /> : list.data?.items.length === 0 ? <EmptyState icon={<UserCog />} title="No staff found" /> : (
          <Table>
            <THead><TR><TH>Name</TH><TH>Roles</TH><TH>Status</TH><TH>Last sign in</TH><TH /></TR></THead>
            <TBody>
              {list.data?.items.map((s) => (
                <TR key={s.id}>
                  <TD><span className="flex items-center gap-3"><Avatar src={s.avatar_url} name={s.name} className="size-8" /><span><span className="flex items-center gap-1 font-medium">{s.name}{s.is_super_admin && <Crown className="size-3.5 text-warning" />}</span><span className="text-xs text-muted-foreground">{s.email}</span></span></span></TD>
                  <TD><span className="flex flex-wrap gap-1">{s.is_super_admin && <Badge variant="warning">Super admin</Badge>}{s.role_names.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}</span></TD>
                  <TD><StatusBadge status={s.status} /></TD>
                  <TD className="text-muted-foreground">{s.last_login_at ? timeAgo(s.last_login_at) : "Never"}</TD>
                  <TD className="text-right">
                    <Can module="users" action="edit"><Button variant="ghost" size="icon-sm" onClick={() => setEdit({ id: s.id })} aria-label="Edit"><Pencil /></Button></Can>
                    <Can module="users" action="delete">{s.id !== me?.id && <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete ${s.name}?`, destructive: true, confirmText: "Delete" })) del.mutate({ params: { path: { id: s.id } } }); }}><Trash2 /></Button>}</Can>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {list.data && <Pagination page={page} perPage={list.data.per_page} total={list.data.total} onPage={setPage} />}
      </Card>
      <StaffDialog open={!!edit} staffId={edit?.id} onOpenChange={(o) => !o && setEdit(null)} />
    </>
  );
}
