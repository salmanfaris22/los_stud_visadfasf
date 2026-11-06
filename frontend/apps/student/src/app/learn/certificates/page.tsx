"use client";
import { Award, Copy, Download, ExternalLink } from "lucide-react";
import { Button, Card, EmptyState, Skeleton, formatDate, lineColor, toast } from "@lms/ui";
import { $api } from "@/lib/api";
import { download } from "@/lib/download";

export default function CertificatesPage() {
  const q = $api.useQuery("get", "/api/v1/me/certificates");
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-[26px] leading-tight font-extrabold sm:text-[32px]">Certificates</h1>
      <p className="mb-6 text-muted-foreground">Earned automatically when every task of a course is approved.</p>
      {q.isLoading ? <Skeleton className="h-48" /> : q.data?.length === 0 ? <EmptyState icon={<Award />} title="No certificates yet" description="Finish all tasks in a course to earn one." /> : (
        <div className="grid gap-5 sm:grid-cols-2">
          {q.data?.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              {/* a ticket for the last stop */}
              <div className="relative overflow-hidden bg-signal p-6 text-signal-foreground">
                <svg aria-hidden viewBox="0 0 240 80" className="pointer-events-none absolute right-0 bottom-0 w-52 opacity-90" fill="none">
                  <path d="M0 60 H120 Q140 60 152 46 L170 26 Q180 16 196 16 H240" stroke={lineColor(c.course_id)} strokeWidth="9" strokeLinecap="round" />
                  <circle cx="196" cy="16" r="10" fill="#ffffff" stroke="#15171e" strokeWidth="4" />
                </svg>
                <div className="flex items-center gap-2 text-xs font-bold opacity-75"><Award className="size-4" /> Certificate of completion</div>
                <div className="relative mt-5 max-w-[80%] font-display text-xl leading-tight font-extrabold">{c.course_title}</div>
                <div className="relative mt-2 text-sm opacity-80">{c.student_name} · {formatDate(c.issued_at)}</div>
                <div className="absolute top-5 right-5 rounded-full bg-[#15171e] px-2.5 py-1 font-mono text-[11px] font-semibold text-white">{c.code}</div>
              </div>
              <div aria-hidden className="relative h-0 border-t-2 border-dashed"><span className="absolute -top-3 -left-3 size-6 rounded-full bg-background" /><span className="absolute -top-3 -right-3 size-6 rounded-full bg-background" /></div>
              <div className="flex flex-wrap gap-2 p-5">
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
