"use client";
import { Award, Copy, Download, ExternalLink } from "lucide-react";
import { Button, Card, EmptyState, Skeleton, formatDate, toast } from "@lms/ui";
import { $api } from "@/lib/api";
import { download } from "@/lib/download";

export default function CertificatesPage() {
  const q = $api.useQuery("get", "/api/v1/me/certificates");
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Certificates</h1>
      <p className="mb-6 text-muted-foreground">Earned automatically when every task of a course is approved.</p>
      {q.isLoading ? <Skeleton className="h-48" /> : q.data?.length === 0 ? <EmptyState icon={<Award />} title="No certificates yet" description="Finish all tasks in a course to earn one." /> : (
        <div className="grid gap-5 sm:grid-cols-2">
          {q.data?.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <div className="relative bg-gradient-to-br from-primary via-violet-600 to-fuchsia-600 p-6 text-white">
                <Award className="size-10 opacity-90" />
                <div className="mt-4 text-xs tracking-widest uppercase opacity-80">Certificate of completion</div>
                <div className="mt-1 font-display text-xl font-bold">{c.course_title}</div>
                <div className="mt-3 text-sm opacity-90">{c.student_name} · {formatDate(c.issued_at)}</div>
                <div className="absolute top-4 right-4 rounded bg-white/15 px-2 py-0.5 font-mono text-xs">{c.code}</div>
              </div>
              <div className="flex flex-wrap gap-2 p-4">
                <Button onClick={() => download(`/api/v1/me/certificates/${c.id}/pdf`, `certificate-${c.code}.pdf`)}><Download /> Download PDF</Button>
                <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(c.verify_url); toast.success("Verification link copied"); }}><Copy /> Copy link</Button>
                <Button variant="ghost" size="icon" asChild><a href={c.verify_url} target="_blank" rel="noreferrer" aria-label="Open verification page"><ExternalLink /></a></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
