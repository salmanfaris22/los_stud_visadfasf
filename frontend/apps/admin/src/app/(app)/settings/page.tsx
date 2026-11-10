"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Link2Off, PlugZap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminService, BrandingSchema, GoogleSettingsSchema, SignupSettingsSchema, UploadSettingsSchema, create, useRpcMutation, useRpcQuery, type Branding, type GoogleSettings, type Settings, type SignupSettings, type UploadSettings } from "@lms/api-client";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, PageHeader, Skeleton, Switch, toast, useConfirm } from "@lms/ui";

import { feedback } from "@/lib/feedback";
import { useSession } from "@/lib/session";
import { ImageUpload } from "@lms/shared";

/** The settings being edited, with every section present. */
type Form = { branding: Branding; signup: SignupSettings; uploads: UploadSettings; google: GoogleSettings };

function toForm(v?: Settings): Form {
  return {
    branding: v?.branding ?? create(BrandingSchema),
    signup: v?.signup ?? create(SignupSettingsSchema),
    uploads: v?.uploads ?? create(UploadSettingsSchema),
    google: v?.google ?? create(GoogleSettingsSchema),
  };
}

function SettingsForm() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const params = useSearchParams();
  const { can } = useSession();
  const q = useRpcQuery(AdminService.method.getSettings, {}, { select: (r) => r.settings });
  const [s, setS] = React.useState<Form | null>(null);
  React.useEffect(() => { if (q.data) setS(toForm(q.data.settings)); }, [q.data]);
  React.useEffect(() => {
    const g = params.get("google");
    if (g === "connected") toast.success("Google account connected");
    else if (g) toast.error(g);
  }, [params]);
  const save = useRpcMutation(AdminService.method.updateSettings, feedback(qc, "Settings saved", [AdminService]));
  const disconnect = useRpcMutation(AdminService.method.disconnectGoogle, feedback(qc, "Google disconnected", [AdminService]));
  if (!s || !q.data) return <Skeleton className="h-96" />;
  const g = q.data.googleStatus ?? { connected: false, configured: false, email: "" };
  const editable = can("settings", "edit");
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate({ input: s }); }} className="grid max-w-4xl gap-6">
      <Card>
        <CardHeader><CardTitle>Branding</CardTitle><CardDescription>Name, logo and colour used on the website, emails and certificates.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Institute name"><Input required value={s.branding.name} onChange={(e) => setS({ ...s, branding: { ...s.branding, name: e.target.value } })} /></Field>
          <Field label="Tagline"><Input value={s.branding.tagline} onChange={(e) => setS({ ...s, branding: { ...s.branding, tagline: e.target.value } })} /></Field>
          <Field label="Primary colour"><div className="flex gap-2"><Input type="color" value={s.branding.primaryColor} onChange={(e) => setS({ ...s, branding: { ...s.branding, primaryColor: e.target.value } })} className="w-14 p-1" /><Input value={s.branding.primaryColor} onChange={(e) => setS({ ...s, branding: { ...s.branding, primaryColor: e.target.value } })} /></div></Field>
          <Field label="Support email"><Input type="email" value={s.branding.supportEmail} onChange={(e) => setS({ ...s, branding: { ...s.branding, supportEmail: e.target.value } })} /></Field>
          <Field label="Logo" className="sm:col-span-2"><ImageUpload value={s.branding.logoUrl} onChange={(u) => setS({ ...s, branding: { ...s.branding, logoUrl: u } })} purpose="cms" aspect="aspect-[3/1]" className="max-w-xs" /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Students & uploads</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border p-3 text-sm sm:col-span-2"><span><span className="font-medium">Allow self sign-up</span><span className="block text-xs text-muted-foreground">Visitors can create a student account. Courses still need to be assigned.</span></span><Switch checked={s.signup.enabled} onCheckedChange={(v) => setS({ ...s, signup: { ...s.signup, enabled: v } })} /></label>
          <Field label="Max image size (MB)" hint="Task images, avatars, thumbnails"><Input type="number" min={1} max={50} value={s.uploads.maxImageMb} onChange={(e) => setS({ ...s, uploads: { ...s.uploads, maxImageMb: Number(e.target.value) } })} /></Field>
          <Field label="Max file size (MB)" hint="Upper limit; each task can set lower"><Input type="number" min={1} max={500} value={s.uploads.maxFileMb} onChange={(e) => setS({ ...s, uploads: { ...s.uploads, maxFileMb: Number(e.target.value) } })} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Google (Calendar, Meet, Drive)</CardTitle><CardDescription>Connect the institute's Google account so the live-session Sync button can create calendar invites, read Meet attendance and attach recordings.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
            {g.connected ? <><CheckCircle2 className="size-5 text-success" /><span className="flex-1">Connected as <b>{g.email}</b></span></> : <span className="flex-1 text-muted-foreground">{g.configured ? "Not connected" : "Server is missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"}</span>}
            {g.configured && editable && <Button type="button" variant={g.connected ? "outline" : "default"} asChild><a href="/api/v1/settings/google/connect"><PlugZap /> {g.connected ? "Reconnect" : "Connect Google"}</a></Button>}
            {g.connected && editable && <Button type="button" variant="outline" onClick={async () => { if (await confirm({ title: "Disconnect Google?", description: "Calendar, attendance and recording sync stop working.", destructive: true, confirmText: "Disconnect" })) disconnect.mutate({}); }}><Link2Off /> Disconnect</Button>}
          </div>
          <label className="flex items-center justify-between rounded-lg border p-3 text-sm"><span><span className="font-medium">Calendar sync</span><span className="block text-xs text-muted-foreground">Works with any Google account</span></span><Switch checked={s.google.calendarSync} onCheckedChange={(v) => setS({ ...s, google: { ...s.google, calendarSync: v } })} /></label>
          <label className="flex items-center justify-between rounded-lg border p-3 text-sm"><span><span className="flex items-center gap-2 font-medium">Google Workspace features <Badge variant="info">Workspace</Badge></span><span className="block text-xs text-muted-foreground">Meet attendance + Drive recordings. Needs a Workspace admin account; reconnect after turning on.</span></span><Switch checked={s.google.workspaceEnabled} onCheckedChange={(v) => setS({ ...s, google: { ...s.google, workspaceEnabled: v } })} /></label>
        </CardContent>
      </Card>
      {editable && <Button type="submit" className="w-fit" loading={save.isPending}>Save settings</Button>}
    </form>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <React.Suspense><SettingsForm /></React.Suspense>
    </>
  );
}
