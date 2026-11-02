"use client";
import * as React from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Button, Card, EmptyState, PageHeader, Pagination, SearchInput, Skeleton, StatusBadge, TBody, TD, TH, THead, TR, Table, formatDate } from "@lms/ui";
import { $api } from "@/lib/api";
import { Can } from "@/lib/session";

export default function BlogPage() {
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const list = $api.useQuery("get", "/api/v1/blog", { params: { query: { q: q || undefined, page } } });
  return (
    <>
      <PageHeader title="Blog" description="Articles for SEO and your community." actions={<Can module="blog" action="create"><Button asChild><Link href="/blog/new"><Plus /> New post</Link></Button></Can>} />
      <Card className="p-4">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search posts…" className="mb-4 sm:w-72" />
        {list.isLoading ? <Skeleton className="h-64" /> : list.data?.items.length === 0 ? <EmptyState icon={<FileText />} title="No posts yet" /> : (
          <Table>
            <THead><TR><TH>Title</TH><TH>Status</TH><TH>Author</TH><TH>Published</TH></TR></THead>
            <TBody>
              {list.data?.items.map((p) => (
                <TR key={p.id}><TD><Link href={`/blog/${p.id}`} className="font-medium hover:underline">{p.title}</Link><div className="text-xs text-muted-foreground">/{p.slug}</div></TD><TD><StatusBadge status={p.status} /></TD><TD>{p.author_name}</TD><TD className="text-muted-foreground">{formatDate(p.published_at) || "—"}</TD></TR>
              ))}
            </TBody>
          </Table>
        )}
        {list.data && <Pagination page={page} perPage={list.data.per_page} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
