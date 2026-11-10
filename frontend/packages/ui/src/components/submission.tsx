"use client";
import * as React from "react";
import { Download, ExternalLink, FileText, HardDrive, Link2, Paperclip, Send, X } from "lucide-react";
import { cn, formatBytes, timeAgo, type DateLike } from "../lib/utils";
import { Button } from "./button";
import { Textarea } from "./input";
import { Avatar } from "./primitives";
import { CodeBlock } from "./content";

export type SubmissionItemView = { id: string; kind: string; content: string; language?: string; fileName?: string; mime?: string; sizeBytes?: number | bigint; url?: string };

/** Shows every part of a task submission: files, images, text, links, Drive links and code. */
export function SubmissionItems({ items }: { items: SubmissionItemView[] }) {
  return (
    <div className="grid gap-3">
      {items.map((it) => {
        switch (it.kind) {
          case "image":
            return (
              <a key={it.id} href={it.url} target="_blank" rel="noreferrer" className="block w-fit overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt={it.fileName} className="max-h-96 object-contain" />
                <span className="block border-t px-3 py-1.5 text-xs text-muted-foreground">{it.fileName} · {formatBytes(it.sizeBytes)}</span>
              </a>
            );
          case "file":
            return (
              <div key={it.id} className="flex items-center gap-3 rounded-xl border p-3">
                <span className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="size-5" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{it.fileName}</span><span className="text-xs text-muted-foreground">{formatBytes(it.sizeBytes)}</span></span>
                <Button variant="outline" size="sm" asChild><a href={it.url} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>
                <Button variant="ghost" size="icon-sm" asChild><a href={`${it.url}?download=1`} aria-label="Download"><Download /></a></Button>
              </div>
            );
          case "link":
          case "drive":
            return (
              <a key={it.id} href={it.content} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 rounded-xl border p-3 text-sm transition hover:border-primary/50">
                <span className="rounded-lg bg-info/10 p-2 text-info">{it.kind === "drive" ? <HardDrive className="size-5" /> : <Link2 className="size-5" />}</span>
                <span className="min-w-0 flex-1 truncate text-primary underline-offset-4 hover:underline">{it.content}</span>
                <ExternalLink className="size-4 text-muted-foreground" />
              </a>
            );
          case "code":
            return <CodeBlock key={it.id} code={it.content} language={it.language} />;
          default:
            return <div key={it.id} className="rounded-xl border bg-muted/30 p-4 text-sm leading-7 whitespace-pre-wrap">{it.content}</div>;
        }
      })}
    </div>
  );
}

export type ThreadMessage = { id: string; authorId: string; authorName: string; authorAvatar?: string; authorKind: string; body: string; createdAt?: DateLike; attachment?: { id: string; fileName: string; url: string } | null };

/** Chat-style task conversation between a student and mentors. */
export function ThreadView({ messages, meId, onSend, sending, onAttach, emptyText = "No messages yet. Ask a question about this task." }: {
  messages: ThreadMessage[]; meId?: string; sending?: boolean; emptyText?: string;
  onSend: (body: string, file?: File) => void | Promise<void>; onAttach?: boolean;
}) {
  const [body, setBody] = React.useState("");
  const [file, setFile] = React.useState<File | undefined>();
  const input = React.useRef<HTMLInputElement>(null);
  const end = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup function.
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  const send = async () => {
    if (!body.trim()) return;
    await onSend(body.trim(), file);
    setBody("");
    setFile(undefined);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>}
        {messages.map((m) => {
          const mine = m.authorId === meId;
          return (
            <div key={m.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
              <Avatar src={m.authorAvatar} name={m.authorName} className="size-8" />
              <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm", mine ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted")}>
                <div className={cn("mb-0.5 text-xs font-medium", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {m.authorName}{m.authorKind === "staff" && " · Mentor"} · {timeAgo(m.createdAt)}
                </div>
                <div className="whitespace-pre-wrap">{m.body}</div>
                {m.attachment && (
                  <a href={m.attachment.url} target="_blank" rel="noreferrer" className={cn("mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs underline-offset-4 hover:underline", mine ? "bg-white/15" : "bg-background")}>
                    <Paperclip className="size-3" /> {m.attachment.fileName}
                  </a>
                )}
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="rounded-xl border p-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Write a message…" className="min-h-0 resize-none border-0 shadow-none focus-visible:ring-0"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }} />
        <div className="flex items-center gap-2 px-1">
          {onAttach && (
            <>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => input.current?.click()} aria-label="Attach file"><Paperclip /></Button>
              <input ref={input} type="file" hidden onChange={(e) => { setFile(e.target.files?.[0]); e.target.value = ""; }} />
              {file && <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">{file.name}<X className="size-3 cursor-pointer" onClick={() => setFile(undefined)} /></span>}
            </>
          )}
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">Ctrl/⌘ + Enter</span>
          <Button size="sm" onClick={() => void send()} loading={sending} disabled={!body.trim()}><Send /> Send</Button>
        </div>
      </div>
    </div>
  );
}
