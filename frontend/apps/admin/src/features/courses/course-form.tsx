"use client";
import * as React from "react";
import { Plus, X } from "lucide-react";
import type { Course, CourseInput as CourseInputMessage, Draft } from "@lms/api-client";
import { Button, Field, Input, MultiSelect, Select, Switch, Textarea } from "@lms/ui";
import { useStaffOptions } from "@/features/common/options";
import { ImageUpload } from "@lms/shared";
import { useSession } from "@/lib/session";

export type CourseInput = Draft<CourseInputMessage>;

export function emptyCourse(c?: Course): CourseInput {
  return {
    title: c?.title ?? "", slug: c?.slug ?? "", subtitle: c?.subtitle ?? "", description: c?.description ?? "", thumbnailUrl: c?.thumbnailUrl ?? "",
    level: (c?.level as CourseInput["level"]) ?? "beginner", language: c?.language ?? "English", category: c?.category ?? "",
    status: (c?.status as CourseInput["status"]) ?? "draft", isPublic: c?.isPublic ?? true, priceLabel: c?.priceLabel ?? "",
    whatYouLearn: c?.whatYouLearn ?? [], mentorIds: c?.mentors.map((m) => m.id) ?? [], feePaise: c?.feePaise ?? 0n,
  };
}

/** All course fields; used on the course page and in the "new course" dialog. */
export function CourseForm({ value, onChange, compact }: { value: CourseInput; onChange: (v: CourseInput) => void; compact?: boolean }) {
  const staff = useStaffOptions();
  const { me } = useSession();
  const set = <K extends keyof CourseInput>(k: K, v: CourseInput[K]) => onChange({ ...value, [k]: v });
  const learn = value.whatYouLearn ?? [];
  return (
    <div className="grid gap-4">
      <Field label="Title" required><Input required minLength={3} value={value.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Go Backend Mastery" /></Field>
      <Field label="Subtitle"><Input value={value.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="One line that sells the course" /></Field>
      {!compact && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Thumbnail"><ImageUpload value={value.thumbnailUrl} onChange={(u) => set("thumbnailUrl", u)} /></Field>
            <div className="grid content-start gap-4">
              <Field label="URL slug" hint="Used in the public course link"><Input value={value.slug} pattern="[a-z0-9-]*" onChange={(e) => set("slug", e.target.value.toLowerCase())} placeholder="auto from title" /></Field>
              <Field label="Category"><Input value={value.category} onChange={(e) => set("category", e.target.value)} placeholder="Backend, Design…" /></Field>
              <Field label="Price label" hint="Shown on the website only"><Input value={value.priceLabel} onChange={(e) => set("priceLabel", e.target.value)} placeholder="₹4,999 or Free" /></Field>
            </div>
          </div>
          <Field label="Description" hint="Markdown supported"><Textarea rows={6} value={value.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="What students will learn">
            <div className="grid gap-2">
              {learn.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={l} onChange={(e) => set("whatYouLearn", learn.map((x, j) => (j === i ? e.target.value : x)))} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => set("whatYouLearn", learn.filter((_, j) => j !== i))} aria-label="Remove"><X /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set("whatYouLearn", [...learn, ""])}><Plus /> Add point</Button>
            </div>
          </Field>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Level"><Select value={value.level} onChange={(e) => set("level", e.target.value as CourseInput["level"])}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="all">All levels</option></Select></Field>
        <Field label="Language"><Input value={value.language} onChange={(e) => set("language", e.target.value)} /></Field>
        <Field label="Status"><Select value={value.status} onChange={(e) => set("status", e.target.value as CourseInput["status"])}><option value="draft">Draft (hidden)</option><option value="published">Published</option><option value="archived">Archived</option></Select></Field>
      </div>
      {!me?.scoped && (
        <Field label="Mentors" hint="Mentors with a scoped role only see their courses">
          <MultiSelect value={value.mentorIds ?? []} onChange={(v) => set("mentorIds", v)} options={(staff.data ?? []).map((s) => ({ value: s.id, label: s.name, hint: s.email }))} placeholder="Choose mentors" />
        </Field>
      )}
      <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
        <span><span className="font-medium">Show on website</span><span className="block text-xs text-muted-foreground">Published public courses appear in the catalog</span></span>
        <Switch checked={value.isPublic} onCheckedChange={(v) => set("isPublic", v)} />
      </label>
    </div>
  );
}
