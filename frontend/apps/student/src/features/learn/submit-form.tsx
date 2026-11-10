"use client";
import * as React from "react";
import { Code2, FileText, HardDrive, Image as ImageIcon, Link2, Plus, Send, Type, X } from "lucide-react";
import { TaskRulesSchema, create, errorMessage, uploadFile, type MessageInitShape, type SubmissionItemInputSchema, type TaskPage, type TaskRules } from "@lms/api-client";
import { Button, Card, Field, FileDrop, Input, Progress, Select, Textarea, cn, formatBytes, toast } from "@lms/ui";
import { api } from "@/lib/api";

type Up = { key: string; file: File; progress: number; uploadId?: string; error?: string; preview?: string };
type Item = MessageInitShape<typeof SubmissionItemInputSchema>;

const LANGS = ["go", "javascript", "typescript", "python", "java", "c", "cpp", "csharp", "php", "ruby", "rust", "kotlin", "swift", "sql", "html", "css", "bash", "other"];

function Uploads({ kind, rules, ups, setUps }: { kind: "file" | "image"; rules: TaskRules; ups: Up[]; setUps: React.Dispatch<React.SetStateAction<Up[]>> }) {
  const limitMB = kind === "image" ? rules.maxImageMb : rules.maxFileMb;
  const add = (files: File[]) => {
    const room = rules.maxFiles > 0 ? rules.maxFiles - ups.length : files.length;
    files.slice(0, Math.max(room, 0)).forEach((file) => {
      const key = crypto.randomUUID();
      const preview = kind === "image" ? URL.createObjectURL(file) : undefined;
      setUps((u) => [...u, { key, file, progress: 0, preview }]);
      uploadFile(api, file, "submission", (p) => setUps((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))))
        .then((r) => setUps((u) => u.map((x) => (x.key === key ? { ...x, uploadId: r.id, progress: 1 } : x))))
        .catch((e) => setUps((u) => u.map((x) => (x.key === key ? { ...x, error: errorMessage(e) } : x))));
    });
    if (files.length > room) toast.error(`You can attach up to ${rules.maxFiles} files`);
  };
  return (
    <div className="grid gap-2">
      <FileDrop onFiles={add} multiple accept={kind === "image" ? "image/png,image/jpeg,image/webp,image/gif" : undefined} maxBytes={limitMB * 1024 * 1024}
        hint={kind === "image" ? `PNG, JPG, WEBP or GIF · max ${limitMB} MB each` : `PDF, ZIP, DOC, XLS… · max ${limitMB} MB each`} onError={(m) => toast.error(m)} />
      {ups.map((u) => (
        <div key={u.key} className={cn("flex items-center gap-3 rounded-lg border p-2", u.error && "border-destructive/50 bg-destructive/5")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {u.preview ? <img src={u.preview} alt="" className="size-10 rounded object-cover" /> : <FileText className="size-5 text-primary" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{u.file.name} <span className="text-xs text-muted-foreground">{formatBytes(u.file.size)}</span></div>
            {u.error ? <div className="text-xs text-destructive">{u.error}</div> : !u.uploadId && <Progress value={u.progress * 100} className="mt-1 h-1" />}
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setUps((x) => x.filter((y) => y.key !== u.key))} aria-label="Remove"><X /></Button>
        </div>
      ))}
    </div>
  );
}

/** Builds the submission from the answer types the task allows. */
export function SubmitForm({ page, onSubmit, submitting }: { page: TaskPage; onSubmit: (items: Item[]) => void; submitting: boolean }) {
  const allowed = new Set(page.task?.allowedTypes ?? []);
  const rules = page.rules ?? create(TaskRulesSchema);
  const [files, setFiles] = React.useState<Up[]>([]);
  const [images, setImages] = React.useState<Up[]>([]);
  const [text, setText] = React.useState("");
  const [links, setLinks] = React.useState<string[]>([""]);
  const [drive, setDrive] = React.useState("");
  const [code, setCode] = React.useState("");
  const [lang, setLang] = React.useState("go");
  const uploading = [...files, ...images].some((u) => !u.uploadId && !u.error);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const items: Item[] = [
      ...files.filter((u) => u.uploadId).map((u) => ({ kind: "file" as const, uploadId: u.uploadId })),
      ...images.filter((u) => u.uploadId).map((u) => ({ kind: "image" as const, uploadId: u.uploadId })),
      ...(text.trim() ? [{ kind: "text" as const, content: text }] : []),
      ...links.filter((l) => l.trim()).map((l) => ({ kind: "link" as const, content: l.trim() })),
      ...(drive.trim() ? [{ kind: "drive" as const, content: drive.trim() }] : []),
      ...(code.trim() ? [{ kind: "code" as const, content: code, language: lang }] : []),
    ];
    if (!items.length) return toast.error("Add at least one answer before submitting");
    onSubmit(items);
  };

  const section = (icon: React.ReactNode, title: string, child: React.ReactNode) => (
    <div className="grid gap-2"><div className="flex items-center gap-2 text-sm font-medium">{icon}{title}</div>{child}</div>
  );
  return (
    <Card className="p-5">
      <form onSubmit={submit} className="grid gap-6">
        <h2 className="text-lg font-bold">Your submission</h2>
        {allowed.has("file") && section(<FileText className="size-4 text-primary" />, "Files", <Uploads kind="file" rules={rules} ups={files} setUps={setFiles} />)}
        {allowed.has("image") && section(<ImageIcon className="size-4 text-primary" />, "Images", <Uploads kind="image" rules={rules} ups={images} setUps={setImages} />)}
        {allowed.has("text") && section(<Type className="size-4 text-primary" />, "Written answer", <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your answer…" />)}
        {allowed.has("link") && section(<Link2 className="size-4 text-primary" />, "Links", (
          <div className="grid gap-2">
            {links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <Input type="url" value={l} onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))} placeholder="https://github.com/you/project" />
                {links.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label="Remove link"><X /></Button>}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setLinks([...links, ""])}><Plus /> Another link</Button>
          </div>
        ))}
        {allowed.has("drive") && section(<HardDrive className="size-4 text-primary" />, "Google Drive link", <Field hint="Share it with “Anyone with the link can view”"><Input type="url" value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="https://drive.google.com/…" /></Field>)}
        {allowed.has("code") && section(<Code2 className="size-4 text-primary" />, "Code", (
          <div className="grid gap-2">
            <Select value={lang} onChange={(e) => setLang(e.target.value)} className="w-44">{LANGS.map((l) => <option key={l} value={l}>{l}</option>)}</Select>
            <Textarea rows={10} value={code} onChange={(e) => setCode(e.target.value)} className="font-mono text-[13px]" placeholder="Paste your code…" spellCheck={false} />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" loading={submitting} disabled={uploading}><Send /> {uploading ? "Uploading…" : "Submit task"}</Button>
          {page.isOverdue && <span className="text-sm text-destructive">The deadline has passed — this will be marked late.</span>}
        </div>
      </form>
    </Card>
  );
}
