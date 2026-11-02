"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@lms/api-client";
import { ImageUpload } from "@lms/shared";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea, toast } from "@lms/ui";
import { $api, invalidate } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function ProfilePage() {
  const qc = useQueryClient();
  const { me } = useSession();
  const [p, setP] = React.useState({ name: "", phone: "", avatar_url: "", bio: "" });
  const [pw, setPw] = React.useState({ current_password: "", new_password: "" });
  React.useEffect(() => { if (me) setP({ name: me.name, phone: me.phone, avatar_url: me.avatar_url, bio: me.bio }); }, [me]);
  const save = $api.useMutation("put", "/api/v1/auth/me", { onSuccess: () => { toast.success("Profile saved"); void invalidate(qc, "/api/v1/auth/me"); }, onError: (e) => toast.error(errorMessage(e)) });
  const change = $api.useMutation("post", "/api/v1/auth/change-password", { onSuccess: () => { toast.success("Password changed"); setPw({ current_password: "", new_password: "" }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 font-display text-2xl font-bold sm:text-3xl">Profile</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Your details</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ body: p }); }}>
              <Field label="Photo"><ImageUpload value={p.avatar_url} onChange={(u) => setP({ ...p, avatar_url: u })} purpose="avatar" aspect="aspect-square" className="w-32" /></Field>
              <Field label="Student ID"><Input value={me?.student_code ?? ""} disabled className="font-mono" /></Field>
              <Field label="Email"><Input value={me?.email ?? ""} disabled /></Field>
              <Field label="Name"><Input required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
              <Field label="Phone"><Input value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
              <Field label="About you"><Textarea rows={3} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} /></Field>
              <Button type="submit" className="w-fit" loading={save.isPending}>Save</Button>
            </form>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); change.mutate({ body: pw }); }}>
              <Field label="Current password"><Input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} autoComplete="current-password" /></Field>
              <Field label="New password" hint="At least 8 characters"><Input type="password" minLength={8} required value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} autoComplete="new-password" /></Field>
              <Button type="submit" className="w-fit" loading={change.isPending}>Update password</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
