"use client";
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PipelineService, useRpcMutation, useRpcQuery, type Counsellor } from "@lms/api-client";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, Skeleton, Switch, TBody, TD, TH, THead, TR, Table, useConfirm } from "@lms/ui";
import { feedback } from "@/lib/feedback";
import { useCourseOptions } from "@/features/common/options";
import { StageBadge } from "./lead-dialog";

const STRATEGIES = [
  { id: "round_robin", label: "Round robin" },
  { id: "least_busy", label: "Least busy" },
  { id: "fifo", label: "Queue (counsellor takes next)" },
  { id: "manual", label: "Manual" },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Stages() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useRpcQuery(PipelineService.method.listStages, {}, { select: (r) => r.items });
  const [f, setF] = React.useState({ name: "", color: "#7c3aed", kind: "open" });
  const create = useRpcMutation(PipelineService.method.createStage, feedback(qc, "Stage added", [PipelineService], () => setF({ name: "", color: "#7c3aed", kind: "open" })));
  const del = useRpcMutation(PipelineService.method.deleteStage, feedback(qc, "Stage deleted", [PipelineService]));
  return (
    <Section title="Pipeline stages" description="Every lead sits in one stage. Won and lost stages close the lead.">
      {q.isLoading ? <Skeleton className="h-32" /> : (
        <ul className="divide-y rounded-xl border">
          {q.data?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <StageBadge name={s.name} color={s.color} />
              <Badge variant={s.kind === "won" ? "success" : s.kind === "lost" ? "destructive" : "secondary"} className="capitalize">{s.kind}</Badge>
              {s.isDefault && <Badge variant="info">New leads</Badge>}
              <span className="flex-1 text-right text-xs text-muted-foreground">{s.leadCount} leads</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Delete ${s.name}`} disabled={s.leadCount > 0} onClick={async () => { if (await confirm({ title: `Delete stage ${s.name}?`, destructive: true, confirmText: "Delete" })) del.mutate({ id: s.id }); }}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      <form className="grid gap-2 sm:grid-cols-[1fr_64px_120px_auto]" onSubmit={(e) => { e.preventDefault(); create.mutate({ input: f }); }}>
        <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Stage name" />
        <Input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="p-1" aria-label="Colour" />
        <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></Select>
        <Button type="submit" variant="outline" loading={create.isPending}><Plus /> Add</Button>
      </form>
    </Section>
  );
}

function LostReasons() {
  const qc = useQueryClient();
  const q = useRpcQuery(PipelineService.method.listLostReasons, {}, { select: (r) => r.items });
  const [label, setLabel] = React.useState("");
  const create = useRpcMutation(PipelineService.method.createLostReason, feedback(qc, "Reason added", [PipelineService], () => setLabel("")));
  const del = useRpcMutation(PipelineService.method.deleteLostReason, feedback(qc, "Reason deleted", [PipelineService]));
  return (
    <Section title="Lost reasons" description="Asked when a lead moves to a lost stage.">
      <div className="flex flex-wrap gap-2">
        {q.data?.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-3 text-sm">
            {r.label}
            <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.label}`} onClick={() => del.mutate({ id: r.id })}><Trash2 /></Button>
          </span>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate({ input: { label } }); }}>
        <Input required minLength={2} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Fees too high" />
        <Button type="submit" variant="outline" loading={create.isPending}><Plus /> Add</Button>
      </form>
    </Section>
  );
}

function Teams() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useRpcQuery(PipelineService.method.listTeams, {}, { select: (r) => r.items });
  const [name, setName] = React.useState("");
  const save = useRpcMutation(PipelineService.method.saveTeam, feedback(qc, "Team saved", [PipelineService], () => setName("")));
  const del = useRpcMutation(PipelineService.method.deleteTeam, feedback(qc, "Team deleted", [PipelineService]));
  return (
    <Section title="Sales teams" description="Group counsellors; assignment rules can send leads to one team.">
      <ul className="divide-y rounded-xl border">
        {q.data?.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="flex-1 font-medium">{t.name}</span>
            <span className="text-xs text-muted-foreground">{t.memberCount} members</span>
            <Button size="icon-sm" variant="ghost" aria-label={`Delete ${t.name}`} onClick={async () => { if (await confirm({ title: `Delete team ${t.name}?`, destructive: true, confirmText: "Delete" })) del.mutate({ id: t.id }); }}><Trash2 /></Button>
          </li>
        ))}
        {q.data?.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No teams yet.</li>}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate({ input: { name } }); }}>
        <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" />
        <Button type="submit" variant="outline" loading={save.isPending}><Plus /> Add</Button>
      </form>
    </Section>
  );
}

function CounsellorRow({ c, teams }: { c: Counsellor; teams: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ teamId: c.teamId ?? "", acceptsLeads: c.acceptsLeads, maxOpenLeads: c.maxOpenLeads, commissionBp: c.commissionBp });
  const save = useRpcMutation(PipelineService.method.updateCounsellor, feedback(qc, "Counsellor saved", [PipelineService]));
  const dirty = f.teamId !== (c.teamId ?? "") || f.acceptsLeads !== c.acceptsLeads || f.maxOpenLeads !== c.maxOpenLeads || f.commissionBp !== c.commissionBp;
  return (
    <TR>
      <TD className="font-medium">{c.name}<div className="text-xs font-normal text-muted-foreground">{c.openLeads} open leads{c.available ? " · on duty" : ""}</div></TD>
      <TD><Select value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })}><option value="">No team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></TD>
      <TD><Switch checked={f.acceptsLeads} onCheckedChange={(v) => setF({ ...f, acceptsLeads: v })} aria-label="Gets new leads" /></TD>
      <TD><Input type="number" min={0} className="w-24" value={f.maxOpenLeads} onChange={(e) => setF({ ...f, maxOpenLeads: Number(e.target.value) })} /></TD>
      <TD><Input type="number" min={0} max={100} step={0.5} className="w-24" value={f.commissionBp / 100} onChange={(e) => setF({ ...f, commissionBp: Math.round(Number(e.target.value) * 100) })} /></TD>
      <TD><Button size="sm" variant="outline" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ id: c.id, input: f })}>Save</Button></TD>
    </TR>
  );
}

function Counsellors() {
  const q = useRpcQuery(PipelineService.method.listCounsellors, {}, { select: (r) => r.items });
  const teams = useRpcQuery(PipelineService.method.listTeams, {}, { select: (r) => r.items });
  return (
    <Section title="Counsellors" description="Staff in a role with the leads permission. Max open leads 0 = no limit.">
      {q.isLoading ? <Skeleton className="h-32" /> : q.data?.length === 0 ? <p className="text-sm text-muted-foreground">No counsellors yet. Give a staff role the Leads permission.</p> : (
        <Table>
          <THead><TR><TH>Counsellor</TH><TH>Team</TH><TH>Gets new leads</TH><TH>Max open</TH><TH>Commission %</TH><TH /></TR></THead>
          <TBody>{q.data?.map((c) => <CounsellorRow key={`${c.id}-${c.teamId}-${c.maxOpenLeads}-${c.acceptsLeads}-${c.commissionBp}`} c={c} teams={teams.data ?? []} />)}</TBody>
        </Table>
      )}
    </Section>
  );
}

function Rules() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useRpcQuery(PipelineService.method.listAssignmentRules, {}, { select: (r) => r.items });
  const teams = useRpcQuery(PipelineService.method.listTeams, {}, { select: (r) => r.items });
  const courses = useCourseOptions();
  const empty = { name: "", source: "", courseId: "", teamId: "", strategy: "round_robin", priority: 100, active: true };
  const [f, setF] = React.useState(empty);
  const save = useRpcMutation(PipelineService.method.saveAssignmentRule, feedback(qc, "Rule saved", [PipelineService], () => setF(empty)));
  const del = useRpcMutation(PipelineService.method.deleteAssignmentRule, feedback(qc, "Rule deleted", [PipelineService]));
  return (
    <Section title="Assignment rules" description="New leads go to the first matching active rule (lowest priority number first).">
      <ul className="divide-y rounded-xl border">
        {q.data?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <span className="font-medium">{r.name}</span>
            <span className="text-muted-foreground">{[r.source || "any source", r.courseTitle || "any course", r.teamName || "all counsellors"].join(" · ")}</span>
            <Badge variant="secondary">{STRATEGIES.find((s) => s.id === r.strategy)?.label ?? r.strategy}</Badge>
            {!r.active && <Badge variant="outline">Off</Badge>}
            <span className="flex-1 text-right text-xs text-muted-foreground">priority {r.priority}</span>
            <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.name}`} onClick={async () => { if (await confirm({ title: `Delete rule ${r.name}?`, destructive: true, confirmText: "Delete" })) del.mutate({ id: r.id }); }}><Trash2 /></Button>
          </li>
        ))}
        {q.data?.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No rules: new leads wait in the queue.</li>}
      </ul>
      <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ input: f }); }}>
        <Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Rule name" />
        <Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="Source (empty = any)" />
        <Select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}><option value="">Any course</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>
        <Select value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })}><option value="">All counsellors</option>{teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        <Select value={f.strategy} onChange={(e) => setF({ ...f, strategy: e.target.value })}>{STRATEGIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
        <div className="flex gap-2">
          <Input type="number" min={0} value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })} aria-label="Priority" />
          <Button type="submit" variant="outline" loading={save.isPending}><Plus /> Add</Button>
        </div>
      </form>
    </Section>
  );
}

/** Sales setup: stages, lost reasons, teams, counsellors and assignment rules. */
export function SalesSetup() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Stages />
      <Rules />
      <LostReasons />
      <Teams />
      <div className="xl:col-span-2"><Counsellors /></div>
    </div>
  );
}
