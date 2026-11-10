import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, Markdown, formatDate } from "@lms/ui";
import { getPost } from "@/lib/server-api";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPost((await params).slug);
  if (!p) return { title: "Post not found" };
  return { title: p.seoTitle || p.title, description: p.seoDescription || p.excerpt, openGraph: { type: "article", images: p.coverUrl ? [p.coverUrl] : [] } };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getPost((await params).slug);
  if (!p) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 pt-32 pb-24 sm:px-6">
      <Link href="/blog" className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" /> Blog</Link>
      <div className="mt-6 flex flex-wrap gap-1">{p.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
      <h1 className="mt-5 font-display text-4xl leading-[1.06] font-extrabold sm:text-5xl">{p.title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{p.authorName} · {formatDate(p.publishedAt)}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.coverUrl && <img src={p.coverUrl} alt="" className="mt-10 w-full rounded-[24px] border" />}
      <Markdown className="mt-8 text-base">{p.content}</Markdown>
    </article>
  );
}
