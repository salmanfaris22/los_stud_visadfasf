"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@lms/api-client";
import { Button, Checkbox, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Field, Input, Switch, Textarea, fromLocalInput, toLocalInput } from "@lms/ui";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";

const TYPES = [
  { id: "file", label: "File upload", hint: "PDF, ZIP, DOC…" },
  { id: "image", label: "Image", hint: "PNG/JPG (max 2 MB)" },
  { id: "text", label: "Text answer", hint: "Written answer" },
  { id: "link", label: "Link", hint: "GitHub, website…" },
  { id: "drive", label: "Google Drive link", hint: "Drive / Docs share link" },
  { id: "code", label: "Code snippet", hint: "With highlighting" },
] as const;
type Kind = (typeof TYPES)[number]["id"];

export function TaskDialog({ courseId, videoId, task, open, onOpenChange }: { courseId: string; videoId: string; task?: Schemas["Task"]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [f, setF] = React.useState({ title: "", instructions: "", allowed: ["file", "text", "link"] as Kind[], max: 10, pass: 0, due: "", late: true, files: 5, mb: 10 });
  React.useEffect(() => {
    if (open)
      setF({
        title: task?.title ?? "", instructions: task?.instructions ?? "", allowed: (task?.allowed_types as Kind[]) ?? ["file", "text", "link"], max: task?.max_marks ?? 10,
        pass: task?.pass_marks ?? 0, due: toLocalInput(task?.due_at), late: task?.allow_late ?? true, files: task?.max_files ?? 5, mb: task?.max_file_mb ?? 10,
      });
  }, [open, task]);
  const paths = [`/api/v1/courses/${courseId}`];
  const create = $api.useMutation("post", "/api/v1/videos/{id}/tasks", feedback(qc, "Task added", paths, () => onOpenChange(false)));
  const update = $api.useMutation("put", "/api/v1/tasks/{id}", feedback(qc, "Task saved", paths, () => onOpenChange(false)));
  const body = {
    title: f.title, instructions: f.instructions, allowed_types: f.allowed, max_marks: f.max, pass_marks: f.pass,
    due_at: f.due ? fromLocalInput(f.due) : undefined, allow_late: f.late, max_files: f.files, max_file_mb: f.mb,
  };
  const toggle = (k: Kind) => setF({ ...f, allowed: f.allowed.includes(k) ? f.allowed.filter((x) => x !== k) : [...f.allowed, k] });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{task ? "Edit task" : "Add task"}</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (task) update.mutate({ params: { path: { id: task.id } }, body }); else create.mutate({ params: { path: { id: videoId } }, body }); }}>
          <Field label="Title" required><Input required minLength={2} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Instructions" hint="Markdown supported"><Textarea rows={5} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
          <Field label="What can students submit?" error={f.allowed.length === 0 ? "Choose at least one" : null}>
            <div className="grid gap-2 sm:grid-cols-3">
              {TYPES.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm hover:bg-accent/50">
                  <Checkbox checked={f.allowed.includes(t.id)} onCheckedChange={() => toggle(t.id)} className="mt-0.5" />
                  <span><span className="block font-medium">{t.label}</span><span className="text-xs text-muted-foreground">{t.hint}</span></span>
                </label>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Late submissions"><label className="flex h-9 items-center gap-2 text-sm"><Switch checked={f.late} onCheckedChange={(v) => setF({ ...f, late: v })} /> Allow after the deadline (marked late)</label></Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!f.allowed.length} loading={create.isPending || update.isPending}>{task ? "Save task" : "Add task"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
