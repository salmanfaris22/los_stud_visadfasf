"use client";
import * as React from "react";
import { ScrollText } from "lucide-react";
import { Badge, Card, EmptyState, Input, PageHeader, Pagination, Select, Skeleton, TBody, TD, TH, THead, TR, Table, formatDateTime } from "@lms/ui";
import { $api } from "@/lib/api";

const ENTITIES = ["student", "staff", "role", "course", "video", "task", "submission", "batch", "batch_type", "enrollment", "live", "quiz", "certificate", "announcement", "comment", "lead", "blog", "cms", "settings", "google", "user"];

export default function AuditPage() {
  const [entity, setEntity] = React.useState("");
  const [action, setAction] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<number | null>(null);
  const list = $api.useQuery("get", "/api/v1/audit", { params: { query: { entity: entity || undefined, action: action || undefined, page, per_page: 30 } } });
  return (
    <>
      <PageHeader title="Audit log" description="Every create, edit and delete with who did it and when." />
      <Card className="p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}><option value="">All areas</option>{ENTITIES.map((e) => <option key={e} value={e}>{e.replace("_", " ")}</option>)}</Select>
          <Input value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="Action (create, update, delete, review…)" />
        </div>
        {list.isLoading ? <Skeleton className="h-96" /> : list.data?.items.length === 0 ? <EmptyState icon={<ScrollText />} title="No activity" /> : (
          <Table>
            <THead><TR><TH>When</TH><TH>Who</TH><TH>Action</TH><TH>Area</TH><TH>IP</TH></TR></THead>
            <TBody>
              {list.data?.items.map((a) => (
                <React.Fragment key={a.id}>
                  <TR className="cursor-pointer" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(a.created_at)}</TD>
                    <TD>{a.actor_name || <span className="text-muted-foreground">System / visitor</span>}</TD>
                    <TD><Badge variant={a.action === "delete" ? "destructive" : a.action === "create" ? "success" : "secondary"}>{a.action}</Badge></TD>
                    <TD className="capitalize">{a.entity.replace("_", " ")} <span className="font-mono text-xs text-muted-foreground">{a.entity_id.slice(0, 8)}</span></TD>
                    <TD className="font-mono text-xs text-muted-foreground">{a.ip}</TD>
                  </TR>
                  {open === a.id && <TR><TD colSpan={5}><pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(a.data, null, 2)}</pre></TD></TR>}
                </React.Fragment>
              ))}
            </TBody>
          </Table>
        )}
        {list.data && <Pagination page={page} perPage={list.data.per_page} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
