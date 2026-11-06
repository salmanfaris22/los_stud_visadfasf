import type { Metadata } from "next";
import { BadgeCheck, ShieldX } from "lucide-react";
import { formatDate } from "@lms/ui";
import { verifyCertificate } from "@/lib/server-api";

export const metadata: Metadata = { title: "Verify certificate", robots: { index: false } };

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = await verifyCertificate(code);
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 pt-28 text-center">
      {c?.valid ? (
        <>
          <span className="rounded-full border-[6px] border-foreground bg-signal p-4 text-signal-foreground shadow-[0_0_0_8px_var(--background),0_0_0_12px_var(--foreground)]"><BadgeCheck className="size-12" /></span>
          <h1 className="mt-6 font-display text-4xl font-extrabold">Certificate verified</h1>
          <p className="mt-4 text-lg"><b>{c.student_name}</b> completed <b>{c.course_title}</b></p>
          <p className="mt-2 text-sm text-muted-foreground">Issued by {c.issuer} on {formatDate(c.issued_at)} · ID {c.code}</p>
        </>
      ) : (
        <>
          <span className="rounded-full bg-destructive/15 p-4 text-destructive"><ShieldX className="size-12" /></span>
          <h1 className="mt-6 font-display text-3xl font-extrabold">{c ? "Certificate revoked" : "Certificate not found"}</h1>
          <p className="mt-3 text-muted-foreground">The code <span className="font-mono">{code}</span> is not a valid certificate.</p>
        </>
      )}
    </div>
  );
}
