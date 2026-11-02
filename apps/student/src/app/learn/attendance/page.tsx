"use client";
import { QrCode } from "lucide-react";
import { Card, EmptyState, Skeleton, StatusBadge, formatDateTime } from "@lms/ui";
import { $api } from "@/lib/api";

export default function AttendancePage() {
  const q = $api.useQuery("get", "/api/v1/me/attendance");
  const rows = q.data ?? [];
  const present = rows.filter((r) => r.status === "present" || r.status === "late").length;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Attendance</h1>
      <p className="mb-6 text-muted-foreground">Offline classroom sessions. Scan your mentor's QR code to check in.</p>
      {q.isLoading ? <Skeleton className="h-48" /> : rows.length === 0 ? <EmptyState icon={<QrCode />} title="No classroom sessions yet" description="Only students in offline batches see attendance." /> : (
        <>
          <Card className="mb-4 p-4 text-sm">You attended <b>{present}</b> of <b>{rows.length}</b> classes ({Math.round((present / rows.length) * 100)}%).</Card>
          <div className="divide-y rounded-xl border">
            {rows.map((r) => (
              <div key={r.class_id} className="flex items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1"><div className="font-medium">{r.title}</div><div className="text-xs text-muted-foreground">{r.batch_name} · {formatDateTime(r.starts_at)}</div></div>
                <StatusBadge status={r.status === "not marked" ? "todo" : r.status} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
