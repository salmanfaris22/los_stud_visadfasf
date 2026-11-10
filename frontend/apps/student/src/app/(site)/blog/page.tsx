import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge, EmptyState, formatDate, lineColor } from "@lms/ui";
import { getPosts } from "@/lib/server-api";

export const metadata: Metadata = { title: "Blog", description: "Guides, career tips and news." };
export const revalidate = 60;

export default async function BlogPage() {
  const posts = await getPosts(50);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-32 pb-24 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold sm:text-6xl">Blog</h1>
      <p className="mt-4 text-lg text-muted-foreground">Guides, career tips and news.</p>
      {posts.length === 0 ? <EmptyState icon={<FileText />} title="No posts yet" className="mt-10" /> : (
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="group overflow-hidden rounded-[20px] border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl dark:shadow-none">
              <div className="map-grid relative aspect-[16/9] overflow-hidden" style={{ background: `color-mix(in oklab, ${lineColor(p.id)} 16%, var(--card))` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.coverUrl && <img src={p.coverUrl} alt="" className="size-full object-cover transition duration-700 group-hover:scale-[1.04]" />}
                <span className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: lineColor(p.id) }} />
              </div>
              <div className="p-6">
                <div className="flex flex-wrap gap-1">{p.tags.slice(0, 3).map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
                <h2 className="mt-3 text-lg leading-snug font-bold">{p.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>
                <p className="mt-3 text-xs text-muted-foreground">{p.authorName} · {formatDate(p.publishedAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
