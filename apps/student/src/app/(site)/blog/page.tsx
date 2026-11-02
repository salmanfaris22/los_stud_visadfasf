import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge, EmptyState, formatDate } from "@lms/ui";
import { getPosts } from "@/lib/server-api";

export const metadata: Metadata = { title: "Blog", description: "Guides, career tips and news." };
export const revalidate = 60;

export default async function BlogPage() {
  const posts = await getPosts(50);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-32 pb-24 sm:px-6">
      <h1 className="font-display text-4xl font-bold tracking-tight">Blog</h1>
      <p className="mt-2 text-muted-foreground">Guides, career tips and news.</p>
      {posts.length === 0 ? <EmptyState icon={<FileText />} title="No posts yet" className="mt-10" /> : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="group overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-1 hover:shadow-xl">
              <div className="aspect-[16/9] bg-gradient-to-br from-primary/40 to-fuchsia-500/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.cover_url && <img src={p.cover_url} alt="" className="size-full object-cover" />}
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-1">{p.tags.slice(0, 3).map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
                <h2 className="mt-3 text-lg font-semibold group-hover:text-primary">{p.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>
                <p className="mt-3 text-xs text-muted-foreground">{p.author_name} · {formatDate(p.published_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
