"use client";
import * as React from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Button, Card, EmptyState, PageHeader, Pagination, SearchInput, Skeleton, StatusBadge, TBody, TD, TH, THead, TR, Table, formatDate } from "@lms/ui";

import { Can } from "@/lib/session";
import { SiteService, useRpcQuery } from "@lms/api-client";

export default function BlogPage() {
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const list = useRpcQuery(SiteService.method.listPosts, { q: q || undefined, page });
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
                <TR key={p.id}><TD><Link href={`/blog/${p.id}`} className="font-medium hover:underline">{p.title}</Link><div className="text-xs text-muted-foreground">/{p.slug}</div></TD><TD><StatusBadge status={p.status} /></TD><TD>{p.authorName}</TD><TD className="text-muted-foreground">{formatDate(p.publishedAt) || "—"}</TD></TR>
              ))}
            </TBody>
          </Table>
        )}
        {list.data && <Pagination page={page} perPage={list.data.perPage} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
