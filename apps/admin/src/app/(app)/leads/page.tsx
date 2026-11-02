"use client";
import * as React from "react";
import { Download, Inbox, Mail, Phone, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@lms/api-client";
import { Button, Card, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Field, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, TBody, TD, TH, THead, TR, Table, Textarea, timeAgo, useConfirm } from "@lms/ui";
import { $api } from "@/lib/api";
import { download, feedback } from "@/lib/feedback";
import { Can } from "@/lib/session";

function LeadDialog({ lead, onClose }: { lead: Schemas["Lead"] | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState("new");
  const [notes, setNotes] = React.useState("");
  React.useEffect(() => { if (lead) { setStatus(lead.status); setNotes(lead.notes); } }, [lead]);
  const save = $api.useMutation("put", "/api/v1/leads/{id}", feedback(qc, "Lead updated", ["/api/v1/leads"], onClose));
  if (!lead) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{lead.name}</DialogTitle></DialogHeader>
        <div className="space-y-1 text-sm">
          <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-primary"><Mail className="size-4" />{lead.email}</a>
          {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-primary"><Phone className="size-4" />{lead.phone}</a>}
          {lead.course_title && <p className="text-muted-foreground">Interested in: {lead.course_title}</p>}
          {lead.message && <p className="mt-2 rounded-lg bg-muted p-3">{lead.message}</p>}
        </div>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="new">New</option><option value="contacted">Contacted</option><option value="converted">Converted</option><option value="lost">Lost</option></Select></Field>
        <Field label="Notes"><Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <DialogFooter><Button loading={save.isPending} onClick={() => save.mutate({ params: { path: { id: lead.id } }, body: { status: status as "new", notes } })}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LeadsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<Schemas["Lead"] | null>(null);
  const list = $api.useQuery("get", "/api/v1/leads", { params: { query: { q: q || undefined, status: (status || undefined) as "new" | undefined, page } } });
  const del = $api.useMutation("delete", "/api/v1/leads/{id}", feedback(qc, "Lead deleted", ["/api/v1/leads"]));
  return (
    <>
      <PageHeader title="Leads" description="Enquiries from the website contact and course forms." actions={<Button variant="outline" onClick={() => download("/api/v1/leads/export", "leads.csv")}><Download /> Export CSV</Button>} />
      <Card className="p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name, email or phone…" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option><option value="new">New</option><option value="contacted">Contacted</option><option value="converted">Converted</option><option value="lost">Lost</option></Select>
        </div>
        {list.isLoading ? <Skeleton className="h-64" /> : list.data?.items.length === 0 ? <EmptyState icon={<Inbox />} title="No enquiries yet" /> : (
          <Table>
            <THead><TR><TH>Name</TH><TH>Contact</TH><TH>Course</TH><TH>Status</TH><TH>Received</TH><TH /></TR></THead>
            <TBody>
              {list.data?.items.map((l) => (
                <TR key={l.id} className="cursor-pointer" onClick={() => setOpen(l)}>
                  <TD className="font-medium">{l.name}<div className="line-clamp-1 text-xs font-normal text-muted-foreground">{l.message}</div></TD>
                  <TD className="text-muted-foreground">{l.email}<div className="text-xs">{l.phone}</div></TD>
                  <TD>{l.course_title || "—"}</TD>
                  <TD><StatusBadge status={l.status} /></TD>
                  <TD className="text-muted-foreground">{timeAgo(l.created_at)}</TD>
                  <TD><Can module="leads" action="delete"><Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: `Delete lead ${l.name}?`, destructive: true, confirmText: "Delete" })) del.mutate({ params: { path: { id: l.id } } }); }}><Trash2 /></Button></Can></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {list.data && <Pagination page={page} perPage={list.data.per_page} total={list.data.total} onPage={setPage} />}
      </Card>
      <LeadDialog lead={open} onClose={() => setOpen(null)} />
    </>
  );
}
