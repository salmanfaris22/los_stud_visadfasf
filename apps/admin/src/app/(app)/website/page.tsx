"use client";
import * as React from "react";
import { ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, PageHeader, Skeleton, cn } from "@lms/ui";
import { $api } from "@/lib/api";
import { feedback } from "@/lib/feedback";
import { useSession } from "@/lib/session";
import { BLOCKS } from "@/features/website/blocks";
import { BlockEditor } from "@/features/website/block-editor";

const SITE = process.env.NEXT_PUBLIC_STUDENT_URL ?? "http://localhost:3000";

export default function WebsitePage() {
  const qc = useQueryClient();
  const { can } = useSession();
  const q = $api.useQuery("get", "/api/v1/cms");
  const [active, setActive] = React.useState(BLOCKS[0]!.key);
  const [data, setData] = React.useState<Record<string, Record<string, unknown>>>({});
  React.useEffect(() => { if (q.data) setData(Object.fromEntries(q.data.map((b) => [b.key, b.data]))); }, [q.data]);
  const save = $api.useMutation("put", "/api/v1/cms/{key}", feedback(qc, "Saved — live on the website", ["/api/v1/cms"]));
  const def = BLOCKS.find((b) => b.key === active)!;
  return (
    <>
      <PageHeader title="Landing page" description="Edit the public website without touching code." actions={<Button variant="outline" asChild><a href={SITE} target="_blank" rel="noreferrer"><ExternalLink /> Open website</a></Button>} />
      {q.isLoading ? <Skeleton className="h-96" /> : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {BLOCKS.map((b) => (
              <button key={b.key} onClick={() => setActive(b.key)} className={cn("rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition", active === b.key ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-accent")}>{b.label}</button>
            ))}
          </nav>
          <Card>
            <CardContent className="space-y-5 pt-5">
              <div><h2 className="font-semibold">{def.label}</h2><p className="text-sm text-muted-foreground">{def.description}</p></div>
              <BlockEditor def={def} value={data[active] ?? {}} onChange={(d) => setData({ ...data, [active]: d })} />
              {can("cms", "edit") && <Button loading={save.isPending} onClick={() => save.mutate({ params: { path: { key: active } }, body: { data: data[active] ?? {} } })}>Save {def.label}</Button>}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
