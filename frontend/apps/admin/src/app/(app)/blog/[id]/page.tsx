"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@lms/api-client";
import { Button, Card, CardContent, Field, Input, Markdown, PageHeader, Select, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, useConfirm } from "@lms/ui";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { ImageUpload } from "@lms/shared";

export default function BlogEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const q = $api.useQuery("get", "/api/v1/blog/{id}", { params: { path: { id } } }, { enabled: !isNew });
  const [f, setF] = React.useState<Schemas["BlogInput"]>({ title: "", slug: "", excerpt: "", content: "", cover_url: "", tags: [], status: "draft", seo_title: "", seo_description: "" });
  React.useEffect(() => {
    const p = q.data;
    if (p) setF({ title: p.title, slug: p.slug, excerpt: p.excerpt, content: p.content, cover_url: p.cover_url, tags: p.tags, status: p.status, seo_title: p.seo_title, seo_description: p.seo_description });
  }, [q.data]);
  const create = $api.useMutation("post", "/api/v1/blog", feedback(qc, "Post created", ["/api/v1/blog"], (p) => router.replace(`/blog/${p.id}`)));
  const update = $api.useMutation("put", "/api/v1/blog/{id}", feedback(qc, "Post saved", ["/api/v1/blog"]));
  const del = $api.useMutation("delete", "/api/v1/blog/{id}", feedback(qc, "Post deleted", ["/api/v1/blog"], () => router.replace("/blog")));
  if (!isNew && q.isLoading) return <Skeleton className="h-96" />;
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (isNew) create.mutate({ body: f }); else update.mutate({ params: { path: { id } }, body: f }); };
  return (
    <form onSubmit={submit}>
      <PageHeader back={<Link href="/blog" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-4" /> Blog</Link>} title={isNew ? "New post" : f.title || "Edit post"}
        actions={<>
          {!isNew && <Button type="button" variant="outline" className="text-destructive" onClick={async () => { if (await confirm({ title: "Delete this post?", destructive: true, confirmText: "Delete" })) del.mutate({ params: { path: { id } } }); }}><Trash2 /></Button>}
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
            <Field label="Cover image"><ImageUpload value={f.cover_url} onChange={(u) => setF({ ...f, cover_url: u })} purpose="blog" /></Field>
            <Field label="Tags" hint="Comma separated"><Input value={(f.tags ?? []).join(", ")} onChange={(e) => setF({ ...f, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} /></Field>
            <Field label="URL slug"><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} placeholder="auto from title" /></Field>
          </CardContent></Card>
          <Card><CardContent className="grid gap-4 pt-5">
            <Field label="SEO title" hint={`${(f.seo_title ?? "").length}/60`}><Input value={f.seo_title} onChange={(e) => setF({ ...f, seo_title: e.target.value })} /></Field>
            <Field label="SEO description" hint={`${(f.seo_description ?? "").length}/160`}><Textarea rows={3} value={f.seo_description} onChange={(e) => setF({ ...f, seo_description: e.target.value })} /></Field>
          </CardContent></Card>
        </div>
      </div>
    </form>
  );
}
