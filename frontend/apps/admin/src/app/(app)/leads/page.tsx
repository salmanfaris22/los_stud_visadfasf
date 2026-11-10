"use client";
import * as React from "react";
import { CalendarClock, Check, Download, Inbox, Plus, Trash2, Upload, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { LeadService, PipelineService, useRpcMutation, useRpcQuery, type ImportResult } from "@lms/api-client";
import {
  Button, Card, Checkbox, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Field, Input, PageHeader, Pagination, SearchInput, Select,
  Skeleton, Switch, TBody, TD, TH, THead, TR, Table, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, cn, formatDateTime, timeAgo, useConfirm,
} from "@lms/ui";
import { rpc } from "@/lib/api";
import { download, feedback } from "@/lib/feedback";
import { Can, useSession } from "@/lib/session";
import { useCourseOptions } from "@/features/common/options";
import { LeadDialog, StageBadge } from "@/features/leads/lead-dialog";
import { SalesSetup } from "@/features/leads/setup";

function NewLeadDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const courses = useCourseOptions();
  const empty = { name: "", phone: "", email: "", city: "", source: "manual", courseId: "", message: "", assignToMe: false };
  const [f, setF] = React.useState(empty);
  React.useEffect(() => { if (open) setF(empty); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = useRpcMutation(LeadService.method.createLead, feedback(qc, null, [LeadService, PipelineService], (r) => {
    onOpenChange(false);
    if (r.result?.lead) onCreated(r.result.lead.id);
  }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add lead</DialogTitle></DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create.mutate({ input: f }); }}>
          <Field label="Name" required className="sm:col-span-2"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+91…" /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="City"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <Field label="Source"><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field>
          <Field label="Course" className="sm:col-span-2">
            <Select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}><option value="">Not decided</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>
          </Field>
          <Field label="Message" className="sm:col-span-2"><Textarea rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={f.assignToMe} onCheckedChange={(v) => setF({ ...f, assignToMe: v })} /> Assign to me</label>
          <DialogFooter className="sm:col-span-2"><Button type="submit" loading={create.isPending}><Plus /> Add lead</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportLeadsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [csv, setCsv] = React.useState("");
  const [result, setResult] = React.useState<ImportResult | null>(null);
  React.useEffect(() => { if (open) { setCsv(""); setResult(null); } }, [open]);
  const run = useRpcMutation(LeadService.method.importLeads, feedback(qc, null, [LeadService, PipelineService], (r) => setResult(r.result ?? null)));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Import leads from CSV</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Header row: <code>name,phone,email,city,source,course,message</code>. Leads with a known phone or email update the existing lead. New leads follow the assignment rules.</p>
        <Input type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); }} />
        <Textarea rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="…or paste CSV here" className="font-mono text-xs" />
        {result && (
          <div className="rounded-xl border p-3 text-sm">
            <b>{result.created}</b> added, <b>{result.skipped}</b> skipped.
            {result.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-destructive">{result.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
        )}
        <DialogFooter><Button disabled={csv.trim().length < 5} loading={run.isPending} onClick={() => run.mutate({ input: { csv } })}><Upload /> Import</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUps({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const [window, setWindow] = React.useState("today");
  const q = useRpcQuery(LeadService.method.listFollowUps, { window }, { select: (r) => r.items });
  const done = useRpcMutation(LeadService.method.completeFollowUp, feedback(qc, "Follow-up done", [LeadService]));
  return (
    <Card className="p-4">
      <div className="mb-4 flex gap-2">
        {[["today", "Today"], ["overdue", "Overdue"], ["week", "This week"]].map(([k, l]) => (
          <Button key={k} size="sm" variant={window === k ? "default" : "outline"} onClick={() => setWindow(k!)}>{l}</Button>
        ))}
      </div>
      {q.isLoading ? <Skeleton className="h-48" /> : q.data?.length === 0 ? <EmptyState icon={<CalendarClock />} title="No follow-ups" description="Schedule one from a lead." /> : (
        <ul className="divide-y rounded-xl border">
          {q.data?.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <CalendarClock className={cn("size-4", f.overdue ? "text-destructive" : "text-muted-foreground")} />
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(f.leadId)}>
                <span className="font-medium">{f.leadName}</span> <span className="text-muted-foreground">· {f.leadPhone} · {f.stageName}</span>
                <span className="block text-xs text-muted-foreground">{formatDateTime(f.dueAt)}{f.note && ` · ${f.note}`}</span>
              </button>
              <Can module="leads" action="edit"><Button size="icon-sm" variant="ghost" aria-label="Mark done" onClick={() => done.mutate({ id: f.id })}><Check /></Button></Can>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function LeadsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const [filter, setFilter] = React.useState({ q: "", stageId: "", ownerId: "", source: "", sort: "created", unassigned: false });
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>([]);
  const stages = useRpcQuery(PipelineService.method.listStages, {}, { select: (r) => r.items });
  const counsellors = useRpcQuery(PipelineService.method.listCounsellors, {}, { select: (r) => r.items });
  const sources = useRpcQuery(LeadService.method.listLeadSources, {}, { select: (r) => r.items });
  const list = useRpcQuery(LeadService.method.listLeads, { ...filter, page, perPage: 25 }, { select: (r) => r.list });
  const del = useRpcMutation(LeadService.method.deleteLead, feedback(qc, "Lead deleted", [LeadService, PipelineService]));
  const bulk = useRpcMutation(LeadService.method.bulkAssignLeads, feedback(qc, "Leads assigned", [LeadService, PipelineService], () => setPicked([])));
  const take = useRpcMutation(LeadService.method.takeNextLead, feedback(qc, null, [LeadService, PipelineService], (r) => r.lead && setOpen(r.lead.id)));
  const set = (patch: Partial<typeof filter>) => { setFilter({ ...filter, ...patch }); setPage(1); setPicked([]); };
  const counts = list.data?.stageCounts ?? {};
  const items = list.data?.items ?? [];
  const allPicked = items.length > 0 && items.every((l) => picked.includes(l.id));

  return (
    <>
      <PageHeader
        title="Leads"
        description="Enquiries from the website, ads, imports and walk-ins, through the sales pipeline."
        actions={<>
          <Can module="leads" action="edit"><Button variant="outline" loading={take.isPending} onClick={() => take.mutate({})}><UserPlus /> Take next lead</Button></Can>
          <Button variant="outline" onClick={() => download(() => rpc(LeadService).exportLeads({}), "leads.csv")}><Download /> Export</Button>
          <Can module="leads" action="create"><Button variant="outline" onClick={() => setImporting(true)}><Upload /> Import</Button></Can>
          <Can module="leads" action="create"><Button onClick={() => setAdding(true)}><Plus /> Add lead</Button></Can>
        </>}
      />
      <Tabs defaultValue="leads">
        <TabsList className="mb-4">
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="follow">Follow-ups</TabsTrigger>
          {can("sales_settings", "edit") && <TabsTrigger value="setup">Setup</TabsTrigger>}
        </TabsList>

        <TabsContent value="leads">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" variant={filter.stageId === "" ? "default" : "outline"} onClick={() => set({ stageId: "" })}>All stages</Button>
            {stages.data?.map((s) => (
              <Button key={s.id} size="sm" variant={filter.stageId === s.id ? "default" : "outline"} onClick={() => set({ stageId: s.id })}>
                <span className="size-2 rounded-full" style={{ background: s.color }} />{s.name}<span className="text-xs opacity-70">{counts[s.id] ?? 0}</span>
              </Button>
            ))}
          </div>
          <Card className="p-4">
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SearchInput value={filter.q} onChange={(v) => set({ q: v })} placeholder="Name, phone or email…" />
              <Select value={filter.unassigned ? "queue" : filter.ownerId} onChange={(e) => set(e.target.value === "queue" ? { unassigned: true, ownerId: "" } : { unassigned: false, ownerId: e.target.value })}>
                <option value="">All owners</option><option value="queue">Unassigned (queue)</option>
                {counsellors.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select value={filter.source} onChange={(e) => set({ source: e.target.value })}>
                <option value="">All sources</option>{sources.data?.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </Select>
              <Select value={filter.sort} onChange={(e) => set({ sort: e.target.value })}>
                <option value="created">Newest first</option><option value="activity">Recent activity</option><option value="follow_up">Next follow-up</option>
              </Select>
              {picked.length > 0 && can("leads", "edit") && (
                <Select value="" onChange={(e) => { if (e.target.value) bulk.mutate({ input: { ids: picked, ownerId: e.target.value === "queue" ? "" : e.target.value } }); }}>
                  <option value="">Assign {picked.length} selected…</option><option value="queue">Back to the queue</option>
                  {counsellors.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </div>
            {list.isLoading ? <Skeleton className="h-64" /> : items.length === 0 ? <EmptyState icon={<Inbox />} title="No leads here" description="Website enquiries, imports and leads you add show up here." /> : (
              <Table>
                <THead><TR>
                  <TH className="w-8"><Checkbox checked={allPicked} onCheckedChange={(v) => setPicked(v ? items.map((l) => l.id) : [])} aria-label="Select all" /></TH>
                  <TH>Lead</TH><TH>Stage</TH><TH>Owner</TH><TH>Course</TH><TH>Next follow-up</TH><TH>Last activity</TH><TH />
                </TR></THead>
                <TBody>
                  {items.map((l) => (
                    <TR key={l.id} className="cursor-pointer" onClick={() => setOpen(l.id)}>
                      <TD onClick={(e) => e.stopPropagation()}><Checkbox checked={picked.includes(l.id)} onCheckedChange={(v) => setPicked(v ? [...picked, l.id] : picked.filter((x) => x !== l.id))} aria-label={`Select ${l.name}`} /></TD>
                      <TD className="font-medium">{l.name}<div className="text-xs font-normal text-muted-foreground">{[l.phone, l.email].filter(Boolean).join(" · ")}{l.source && ` · ${l.source.replace(/_/g, " ")}`}</div></TD>
                      <TD><StageBadge name={l.stageName} color={l.stageColor} /></TD>
                      <TD>{l.ownerName || <span className="text-muted-foreground">Queue</span>}</TD>
                      <TD className="text-muted-foreground">{l.courseTitle || "—"}</TD>
                      <TD className="text-muted-foreground">{l.nextFollowUpAt ? formatDateTime(l.nextFollowUpAt) : "—"}</TD>
                      <TD className="text-muted-foreground">{timeAgo(l.lastActivityAt)}</TD>
                      <TD onClick={(e) => e.stopPropagation()}>
                        <Can module="leads" action="delete"><Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete lead ${l.name}?`, destructive: true, confirmText: "Delete" })) del.mutate({ id: l.id }); }}><Trash2 /></Button></Can>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            {list.data && <Pagination page={page} perPage={list.data.perPage} total={list.data.total} onPage={setPage} />}
          </Card>
        </TabsContent>

        <TabsContent value="follow"><FollowUps onOpen={setOpen} /></TabsContent>
        {can("sales_settings", "edit") && <TabsContent value="setup"><SalesSetup /></TabsContent>}
      </Tabs>

      <LeadDialog leadId={open} onClose={() => setOpen(null)} stages={stages.data ?? []} />
      <NewLeadDialog open={adding} onOpenChange={setAdding} onCreated={setOpen} />
      <ImportLeadsDialog open={importing} onOpenChange={setImporting} />
    </>
  );
}
