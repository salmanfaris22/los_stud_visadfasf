"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { type BlogInput, SiteService, useRpcMutation, useRpcQuery, type Draft } from "@lms/api-client";
import { Button, Card, CardContent, Field, Input, Markdown, PageHeader, Select, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, useConfirm } from "@lms/ui";

import { feedback } from "@/lib/feedback";
import { ImageUpload } from "@lms/shared";

export default function BlogEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = useRpcQuery(SiteService.method.getPost, { id }, { enabled: !isNew, select: (r) => r.post });
  const [f, setF] = React.useState<Draft<BlogInput>>({ title: "", slug: "", excerpt: "", content: "", coverUrl: "", tags: [], status: "draft", seoTitle: "", seoDescription: "" });
  React.useEffect(() => {
    const p = q.data;
    if (p) setF({ title: p.title, slug: p.slug, excerpt: p.excerpt, content: p.content, coverUrl: p.coverUrl, tags: p.tags, status: p.status, seoTitle: p.seoTitle, seoDescription: p.seoDescription });
  }, [q.data]);
  const create = useRpcMutation(SiteService.method.createPost, feedback(qc, "Post created", [SiteService], (r) => router.replace(`/blog/${r.post?.id}`)));
  const update = useRpcMutation(SiteService.method.updatePost, feedback(qc, "Post saved", [SiteService]));
  const del = useRpcMutation(SiteService.method.deletePost, feedback(qc, "Post deleted", [SiteService], () => router.replace("/blog")));
  if (!isNew && q.isLoading) return <Skeleton className="h-96" />;
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (isNew) create.mutate({ input: f }); else update.mutate({ id, input: f }); };
  return (
    <form onSubmit={submit}>
      <PageHeader back={<Link href="/blog" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-4" /> Blog</Link>} title={isNew ? "New post" : f.title || "Edit post"}
        actions={<>
          {!isNew && <Button type="button" variant="outline" className="text-destructive" onClick={async () => { if (await confirm({ title: "Delete this post?", destructive: true, confirmText: "Delete" })) del.mutate({ id }); }}><Trash2 /></Button>}
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as "draft" })} className="w-36"><option value="draft">Draft</option><option value="published">Published</option></Select>
          <Button type="submit" loading={create.isPending || update.isPending}>Save</Button>
        </>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card><CardContent className="grid gap-4 pt-5">
          <Field label="Title" required><Input required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="text-lg" /></Field>
          <Field label="Excerpt"><Textarea rows={2} value={f.excerpt} onChange={(e) => setF({ ...f, excerpt: e.target.value })} /></Field>
          <Tabs defaultValue="write">
            <TabsList><TabsTrigger value="write">Write</TabsTrigger><TabsTrigger value="preview">Preview</TabsTrigger></TabsList>
            <TabsContent value="write"><Textarea rows={22} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} className="font-mono text-sm" placeholder="## Write in Markdown…" /></TabsContent>
            <TabsContent value="preview"><div className="min-h-64 rounded-lg border p-5"><Markdown>{f.content || "_Nothing yet_"}</Markdown></div></TabsContent>
          </Tabs>
        </CardContent></Card>
        <div className="space-y-6">
          <Card><CardContent className="grid gap-4 pt-5">
            <Field label="Cover image"><ImageUpload value={f.coverUrl} onChange={(u) => setF({ ...f, coverUrl: u })} purpose="blog" /></Field>
            <Field label="Tags" hint="Comma separated"><Input value={(f.tags ?? []).join(", ")} onChange={(e) => setF({ ...f, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} /></Field>
            <Field label="URL slug"><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} placeholder="auto from title" /></Field>
          </CardContent></Card>
          <Card><CardContent className="grid gap-4 pt-5">
            <Field label="SEO title" hint={`${(f.seoTitle ?? "").length}/60`}><Input value={f.seoTitle} onChange={(e) => setF({ ...f, seoTitle: e.target.value })} /></Field>
            <Field label="SEO description" hint={`${(f.seoDescription ?? "").length}/160`}><Textarea rows={3} value={f.seoDescription} onChange={(e) => setF({ ...f, seoDescription: e.target.value })} /></Field>
          </CardContent></Card>
        </div>
      </div>
    </form>
  );
}
