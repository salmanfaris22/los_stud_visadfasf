"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthService, errorMessage, useRpcMutation } from "@lms/api-client";
import { ImageUpload } from "@lms/shared";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea, toast } from "@lms/ui";
import { invalidate } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function ProfilePage() {
  const qc = useQueryClient();
  const { me } = useSession();
  const [p, setP] = React.useState({ name: "", phone: "", avatarUrl: "", bio: "" });
  const [pw, setPw] = React.useState({ currentPassword: "", newPassword: "" });
  React.useEffect(() => { if (me) setP({ name: me.name, phone: me.phone, avatarUrl: me.avatarUrl, bio: me.bio }); }, [me]);
  const save = useRpcMutation(AuthService.method.updateProfile, { onSuccess: () => { toast.success("Profile saved"); void invalidate(qc, AuthService.method.getMe); }, onError: (e) => toast.error(errorMessage(e)) });
  const change = useRpcMutation(AuthService.method.changePassword, { onSuccess: () => { toast.success("Password changed"); setPw({ currentPassword: "", newPassword: "" }); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 font-display text-[26px] leading-tight font-extrabold sm:text-[32px]">Profile</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Your details</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(p); }}>
              <Field label="Photo"><ImageUpload value={p.avatarUrl} onChange={(u) => setP({ ...p, avatarUrl: u })} purpose="avatar" aspect="aspect-square" className="w-32" /></Field>
              <Field label="Student ID"><Input value={me?.studentCode ?? ""} disabled className="font-mono" /></Field>
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
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); change.mutate(pw); }}>
              <Field label="Current password"><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
              <Field label="New password" hint="At least 8 characters"><Input type="password" minLength={8} required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></Field>
              <Button type="submit" className="w-fit" loading={change.isPending}>Update password</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
