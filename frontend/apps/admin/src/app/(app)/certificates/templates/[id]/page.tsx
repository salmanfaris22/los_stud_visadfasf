"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Eye, FileImage, ImageIcon, Plus, QrCode, Save, Type } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ImageUpload } from "@lms/shared";
import {
  Button, Card, Dialog, DialogContent, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, Field as FormField, Input, Select, Skeleton, Switch, cn, toast,
} from "@lms/ui";
import { CertificateService, CourseService, errorMessage, useRpcMutation, useRpcQuery, type CertificateTemplateInput, type Draft } from "@lms/api-client";

import { rpc } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { useCourseOptions } from "@/features/common/options";
import { CertificateCanvas } from "@/features/certificates/certificate-canvas";
import { FieldPanel } from "@/features/certificates/field-panel";
import { presetField, sampleValues, type Field } from "@/features/certificates/layout";

type TemplateDraft = Draft<CertificateTemplateInput>;

const blank = (): TemplateDraft => ({
  name: "New certificate",
  backgroundUrl: "",
  isDefault: false,
  fields: [
    { ...presetField("student"), x: 30, y: 85, w: 237, align: "center" },
    { ...presetField("description"), x: 48, y: 120, w: 200, align: "center", color: "#1f2937" },
    { ...presetField("code"), x: 30, y: 186, color: "#374151" },
    { ...presetField("qr"), x: 251, y: 172 },
  ].map((f) => ({ ...f, color: f.kind === "qr" ? f.color : f.color === "#ffffff" ? "#111827" : f.color })),
});

const ADD: { kind: Parameters<typeof presetField>[0]; label: string; icon: React.ElementType }[] = [
  { kind: "student", label: "Student name", icon: Type },
  { kind: "course", label: "Course title", icon: Type },
  { kind: "description", label: "Description", icon: Type },
  { kind: "year", label: "Year", icon: Type },
  { kind: "date", label: "Date", icon: Type },
  { kind: "code", label: "Certificate ID", icon: Type },
  { kind: "text", label: "Custom text", icon: Type },
  { kind: "qr", label: "QR code (verify)", icon: QrCode },
  { kind: "image", label: "Image (signature, logo)", icon: ImageIcon },
];

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const qc = useQueryClient();
  const q = useRpcQuery(CertificateService.method.getCertificateTemplate, { id }, { enabled: !isNew });
  const [draft, setDraft] = React.useState<TemplateDraft | null>(isNew ? blank() : null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [courseId, setCourseId] = React.useState("");
  const [preview, setPreview] = React.useState<{ url: string; busy: boolean } | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const courses = useCourseOptions();
  const course = useRpcQuery(CourseService.method.getCourse, { id: courseId }, { enabled: !!courseId });

  React.useEffect(() => {
    const t = q.data?.template;
    if (t && !draft) setDraft({ name: t.name, backgroundUrl: t.backgroundUrl, isDefault: t.isDefault, fields: t.fields.map((f) => ({ ...f })) as Field[] });
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (fn: (d: TemplateDraft) => TemplateDraft) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
  };
  const patchField = (fid: string, patch: Partial<Field>) =>
    update((d) => ({ ...d, fields: (d.fields ?? []).map((f) => (f.id === fid ? { ...f, ...patch } : f)) }));
  const removeField = (fid: string) => {
    update((d) => ({ ...d, fields: (d.fields ?? []).filter((f) => f.id !== fid) }));
    setSelected(null);
  };
  const addField = (kind: Parameters<typeof presetField>[0]) => {
    const f = presetField(kind);
    update((d) => ({ ...d, fields: [...(d.fields ?? []), f] }));
    setSelected(f.id);
  };

  const create = useRpcMutation(CertificateService.method.createCertificateTemplate, feedback(qc, "Template saved", [CertificateService], (r) => {
    setDirty(false);
    if (r.template) router.replace(`/certificates/templates/${r.template.id}`);
  }));
  const save = useRpcMutation(CertificateService.method.updateCertificateTemplate, feedback(qc, "Template saved", [CertificateService], () => setDirty(false)));
  const saving = create.isPending || save.isPending;
  const onSave = () => {
    if (!draft) return;
    if (isNew) create.mutate({ input: draft });
    else save.mutate({ id, input: draft });
  };

  const showPreview = async () => {
    if (!draft) return;
    setPreview({ url: "", busy: true });
    try {
      const r = await rpc(CertificateService).previewCertificateTemplate({ input: draft, ...(courseId ? { courseId } : {}) });
      const blob = new Blob([r.file!.data as BlobPart], { type: "application/pdf" });
      setPreview({ url: URL.createObjectURL(blob), busy: false });
    } catch (e) {
      setPreview(null);
      toast.error(errorMessage(e));
    }
  };
  React.useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview?.url]);

  // Arrow keys nudge the selected field (Shift = 5 mm); Delete removes it.
  const onKey = (e: React.KeyboardEvent) => {
    if (!selected || !draft) return;
    const f = draft.fields?.find((x) => x.id === selected);
    if (!f) return;
    const step = e.shiftKey ? 5 : 0.5;
    const moves: Record<string, Partial<Field>> = { ArrowLeft: { x: f.x - step }, ArrowRight: { x: f.x + step }, ArrowUp: { y: f.y - step }, ArrowDown: { y: f.y + step } };
    if (moves[e.key]) {
      e.preventDefault();
      patchField(f.id, moves[e.key]!);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeField(f.id);
    }
  };

  if (!isNew && q.isLoading) return <div className="grid gap-4 lg:grid-cols-[1fr_340px]"><Skeleton className="aspect-[297/210]" /><Skeleton className="h-[480px]" /></div>;
  if (!draft) return <p className="text-muted-foreground">{q.error ? errorMessage(q.error) : "Template not found."}</p>;

  const values = sampleValues(courseId && course.data?.course ? { title: course.data.course.title, certificateText: course.data.course.certificateText } : undefined);
  const fields = (draft.fields ?? []) as Field[];
  const sel = fields.find((f) => f.id === selected) ?? null;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/certificates?tab=templates" aria-label="Back to templates"><ArrowLeft /></Link></Button>
        <Input value={draft.name} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} className="h-10 max-w-sm font-display text-lg font-bold" aria-label="Template name" />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={!!draft.isDefault} onCheckedChange={(v) => update((d) => ({ ...d, isDefault: v }))} /> Default template
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button variant="outline" onClick={showPreview} loading={preview?.busy}><Eye /> Preview PDF</Button>
          <Button onClick={onSave} loading={saving} disabled={!draft.name.trim()}><Save /> Save</Button>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" variant="outline"><Plus /> Add field</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Add to the certificate</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ADD.map((a) => (
                  <DropdownMenuItem key={a.kind} onSelect={() => addField(a.kind)}><a.icon /> {a.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-xs text-muted-foreground">Drag to move · handle to resize · arrow keys to nudge</span>
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="ml-auto h-8 w-auto text-xs" aria-label="Sample course">
              <option value="">Sample: AI Video Production</option>
              {courses.data?.map((c) => <option key={c.id} value={c.id}>Sample: {c.title}</option>)}
            </Select>
          </div>
          <div className="bg-[#0b1020] p-4 outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:p-6" tabIndex={0} onKeyDown={onKey}>
            <div className="mx-auto max-w-[1100px] shadow-2xl">
              <CertificateCanvas background={draft.backgroundUrl} fields={fields} values={values} selected={selected} onSelect={setSelected} onMove={patchField} />
            </div>
          </div>
        </Card>

        <div className="grid gap-5">
          <Card className="grid gap-3 p-4">
            <FormField label="Background" hint="A4 landscape (3508 × 2480 px), JPG or PNG">
              <ImageUpload value={draft.backgroundUrl} onChange={(u) => update((d) => ({ ...d, backgroundUrl: u }))} purpose="certificate" aspect="aspect-[297/210]" />
            </FormField>
          </Card>
          <Card className="p-2">
            <div className="px-2 pt-1 pb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">Fields</div>
            <ul className="grid gap-0.5">
              {fields.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => setSelected(f.id)} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted", selected === f.id && "bg-muted font-semibold")}>
                    {f.kind === "qr" ? <QrCode className="size-4 shrink-0 text-muted-foreground" /> : f.kind === "image" ? <FileImage className="size-4 shrink-0 text-muted-foreground" /> : <Type className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{f.label || f.text || f.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {sel && (
            <Card className="p-4">
              <FieldPanel field={sel} onChange={(p) => patchField(sel.id, p)} onDelete={() => removeField(sel.id)} />
            </Card>
          )}
        </div>
      </div>

      <Dialog open={!!preview && !preview.busy} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>Preview: {values.student}</DialogTitle></DialogHeader>
          {preview?.url && <iframe src={preview.url} title="Certificate PDF preview" className="aspect-[297/210] w-full rounded-lg border bg-white" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
