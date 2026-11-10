"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CourseVersionService, errorMessage, type Schemas } from "@lms/api-client";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Field, Input, Switch, Textarea, VideoPlayer, cn } from "@lms/ui";
import { $api, api } from "@/lib/api";
import { feedback } from "@/lib/feedback";

const PROVIDERS = [
  { id: "youtube", label: "YouTube", hint: "youtube.com/watch?v=… or youtu.be/…", color: "bg-red-500" },
  { id: "vimeo", label: "Vimeo", hint: "vimeo.com/123456789 (private links keep the hash)", color: "bg-sky-500" },
  { id: "bunny", label: "Bunny Stream", hint: "iframe.mediadelivery.net/embed/<library>/<video>", color: "bg-orange-500" },
  { id: "cloudflare", label: "Cloudflare Stream", hint: "Video id or customer-….cloudflarestream.com link", color: "bg-amber-500" },
] as const;
type Provider = (typeof PROVIDERS)[number]["id"];

function toSeconds(v: string) {
  const parts = v.split(":").map((p) => Number(p) || 0);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}
function fromSeconds(s?: number) {
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Add or edit a video. The pasted link is validated live and previewed in the real player. */
export function VideoDialog({ courseId, video, open, onOpenChange }: { courseId: string; video?: Schemas["Video"]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [provider, setProvider] = React.useState<Provider>("youtube");
  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [duration, setDuration] = React.useState("");
  const [preview, setPreview] = React.useState(false);
  const [parsed, setParsed] = React.useState<Schemas["VideoLink"] | null>(null);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setProvider((video?.provider as Provider) ?? "youtube");
    setUrl(video?.source_url ?? "");
    setTitle(video?.title ?? "");
    setDescription(video?.description ?? "");
    setDuration(fromSeconds(video?.duration_seconds));
    setPreview(video?.is_preview ?? false);
  }, [open, video]);

  React.useEffect(() => {
    setParsed(null);
    setLinkError(null);
    if (url.trim().length < 3) return;
    const t = setTimeout(async () => {
      const r = await api.client.POST("/api/v1/videos/parse", { body: { provider, url } });
      if (r.data) setParsed(r.data);
      else setLinkError(errorMessage(r.error));
    }, 400);
    return () => clearTimeout(t);
  }, [provider, url]);

  const paths = [`/api/v1/courses/${courseId}`, CourseVersionService];
  const create = $api.useMutation("post", "/api/v1/courses/{id}/videos", feedback(qc, "Video added", paths, () => onOpenChange(false)));
  const update = $api.useMutation("put", "/api/v1/videos/{id}", feedback(qc, "Video saved", paths, () => onOpenChange(false)));
  const body = { title, description, provider, url, duration_seconds: toSeconds(duration), is_preview: preview };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{video ? "Edit video" : "Add video"}</DialogTitle></DialogHeader>
        <form
          className="grid gap-5 lg:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (video) update.mutate({ params: { path: { id: video.id } }, body });
            else create.mutate({ params: { path: { id: courseId } }, body });
          }}
        >
          <div className="grid content-start gap-4">
            <Field label="Video host">
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map((p) => (
                  <button type="button" key={p.id} onClick={() => setProvider(p.id)} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition", provider === p.id ? "border-foreground bg-signal/15 font-medium" : "hover:bg-accent")}>
                    <span className={cn("size-2.5 rounded-full", p.color)} /> {p.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Video link" hint={PROVIDERS.find((p) => p.id === provider)?.hint} error={linkError}>
              <Input required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste the link" />
            </Field>
            <Field label="Title" required><Input required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Description" hint="Markdown supported"><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Duration" hint="mm:ss or h:mm:ss"><Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="12:30" /></Field>
              <Field label="Free preview"><label className="flex h-9 items-center gap-2 text-sm"><Switch checked={preview} onCheckedChange={setPreview} /> Show on course page</label></Field>
            </div>
          </div>
          <div className="grid content-start gap-3">
            <span className="text-sm font-medium">Preview</span>
            {parsed ? <VideoPlayer embedUrl={parsed.embed_url} title={title || "Preview"} watermark="student@example.com" /> : (
              <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">Paste a valid link to preview</div>
            )}
            <p className="text-xs text-muted-foreground">Students see a moving watermark with their email. Restrict embedding to your domain in your video host settings.</p>
          </div>
          <DialogFooter className="lg:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!parsed} loading={create.isPending || update.isPending}>{video ? "Save video" : "Add video"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
