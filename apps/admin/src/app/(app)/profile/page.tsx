"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Textarea } from "@lms/ui";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { useSession } from "@/lib/session";
import { ImageUpload } from "@lms/shared";

export default function ProfilePage() {
  const qc = useQueryClient();
  const { me } = useSession();
  const [p, setP] = React.useState({ name: "", phone: "", avatar_url: "", bio: "" });
  const [pw, setPw] = React.useState({ current_password: "", new_password: "" });
  React.useEffect(() => { if (me) setP({ name: me.name, phone: me.phone, avatar_url: me.avatar_url, bio: me.bio }); }, [me]);
  const save = $api.useMutation("put", "/api/v1/auth/me", feedback(qc, "Profile saved", ["/api/v1/auth/me"]));
  const change = $api.useMutation("post", "/api/v1/auth/change-password", feedback(qc, "Password changed", [], () => setPw({ current_password: "", new_password: "" })));
  return (
    <>
      <PageHeader title="Your profile" />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ body: p }); }}>
              <Field label="Photo"><ImageUpload value={p.avatar_url} onChange={(u) => setP({ ...p, avatar_url: u })} purpose="avatar" aspect="aspect-square" className="w-32" /></Field>
              <Field label="Name"><Input required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
              <Field label="Phone"><Input value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
              <Field label="Bio" hint="Shown on public course pages for mentors"><Textarea rows={3} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} /></Field>
              <Button type="submit" className="w-fit" loading={save.isPending}>Save</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
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
    </>
  );
}
