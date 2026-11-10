"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage, type ImportResult, StudentService, useRpcMutation } from "@lms/api-client";
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, FileDrop, Select, Textarea, toast } from "@lms/ui";
import { invalidate } from "@/lib/api";
import { useBatchOptions, useCourseOptions } from "@/features/common/options";

const SAMPLE = "name,email,phone,password\nAnu Joseph,anu@example.com,+919800000001,\nVivek R,vivek@example.com,,Secret@123";

export function ImportStudentsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [csv, setCsv] = React.useState("");
  const [courseId, setCourseId] = React.useState("");
  const [batchId, setBatchId] = React.useState("");
  const [invites, setInvites] = React.useState(true);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const courses = useCourseOptions();
  const batches = useBatchOptions(courseId || undefined);
  const run = useRpcMutation(StudentService.method.importStudents, {
    onSuccess: (r) => { setResult(r.result ?? null); void invalidate(qc, StudentService); toast.success(`${r.result?.created ?? 0} students created`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setResult(null); setCsv(""); } }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import students from CSV</DialogTitle>
          <DialogDescription>Columns: <code>name, email, phone, password</code>. Existing emails are skipped. Empty passwords get an invite email.</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 text-sm">
            <p><b className="text-success">{result.created}</b> created · <b>{result.skipped}</b> skipped (already exist) · <b className="text-destructive">{result.errors.length}</b> errors</p>
            {result.errors.length > 0 && <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs">{result.errors.join("\n")}</pre>}
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <FileDrop accept=".csv,text/csv" multiple={false} hint="CSV file up to 3 MB" onFiles={async ([f]) => setCsv(await f!.text())} />
            <Field label="…or paste CSV" hint={<button type="button" className="text-primary" onClick={() => setCsv(SAMPLE)}>Use sample</button>}>
              <Textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} className="font-mono text-xs" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assign course (optional)"><Select value={courseId} onChange={(e) => { setCourseId(e.target.value); setBatchId(""); }}><option value="">None</option>{courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
              <Field label="Batch"><Select value={batchId} disabled={!courseId} onChange={(e) => setBatchId(e.target.value)}><option value="">No batch</option>{batches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={invites} onCheckedChange={(v) => setInvites(!!v)} /> Email invite links to students without a password</label>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={csv.trim().length < 5} loading={run.isPending} onClick={() => run.mutate({ input: { csv, courseId: courseId || undefined, batchId: batchId || undefined, sendInvites: invites } })}>Import</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
