"use client";
import * as React from "react";
import { CheckCircle2, Send } from "lucide-react";
import { errorMessage } from "@lms/api-client";
import { Button, Field, Input } from "@lms/ui";
import { $api } from "@/lib/api";

/** Enquiry form → creates a lead in the admin panel. */
export function LeadForm({ courseId, source = "website", compact }: { courseId?: string; source?: string; compact?: boolean }) {
  const [f, setF] = React.useState({ name: "", phone: "" });
  const send = $api.useMutation("post", "/api/v1/public/leads");
  if (send.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border bg-success/10 p-8 text-center text-success">
        <CheckCircle2 className="size-8" /><p className="font-semibold">Thanks, {f.name.split(" ")[0]}!</p><p className="text-sm">{send.data.message}</p>
      </div>
    );
  }
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); send.mutate({ body: { ...f, course_id: courseId, source } }); }}>
      <div className={compact ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
        <Field label="Your name" required><Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone / WhatsApp" required><Input type="tel" required minLength={8} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      {send.error && <p className="text-sm text-destructive">{errorMessage(send.error)}</p>}
      <Button type="submit" size="lg" loading={send.isPending}><Send /> Send enquiry</Button>
    </form>
  );
}
