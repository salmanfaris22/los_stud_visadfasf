"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { errorMessage, BatchService, useRpcMutation } from "@lms/api-client";
import { Button, Spinner } from "@lms/ui";

function Checkin() {
  const params = useSearchParams();
  const checkin = useRpcMutation(BatchService.method.checkIn);
  const token = params.get("token") ?? "";
  React.useEffect(() => { if (token) checkin.mutate({ input: { token } }); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 text-center">
      {checkin.isPending || (!checkin.data && !checkin.error && token) ? <><Spinner className="size-10" /><p>Checking you in…</p></> : checkin.data ? (
        <><CheckCircle2 className="size-16 text-success" /><h1 className="font-display text-2xl font-extrabold">You're marked {checkin.data.result?.status}</h1><p className="text-muted-foreground">{checkin.data.result?.classTitle} · {checkin.data.result?.batchName}</p></>
      ) : (
        <><XCircle className="size-16 text-destructive" /><h1 className="font-display text-2xl font-extrabold">Check-in failed</h1><p className="text-muted-foreground">{token ? errorMessage(checkin.error) : "Scan the QR code shown by your mentor."}</p></>
      )}
      <Button asChild variant="outline"><Link href="/learn/attendance">My attendance</Link></Button>
    </div>
  );
}

export default function CheckinPage() {
  return <React.Suspense><Checkin /></React.Suspense>;
}
