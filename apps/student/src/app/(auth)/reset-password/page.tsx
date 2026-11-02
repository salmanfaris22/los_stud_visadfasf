"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { errorMessage } from "@lms/api-client";
import { Button, Field, Input } from "@lms/ui";
import { $api } from "@/lib/api";

function ResetForm() {
  const params = useSearchParams();
  const invite = params.get("invite") === "1";
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const reset = $api.useMutation("post", "/api/v1/auth/reset");
  const mismatch = pw2.length > 0 && pw !== pw2;
  return (
    <div>
      <h2 className="font-display text-2xl font-bold">{invite ? "Set your password" : "Choose a new password"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Use at least 8 characters.</p>
      {reset.isSuccess ? (
        <div className="mt-8 space-y-4">
          <p className="rounded-lg bg-success/10 p-4 text-sm text-success">{reset.data.message}</p>
          <Button asChild className="w-full"><Link href="/login">Go to sign in</Link></Button>
        </div>
      ) : (
        <form className="mt-8 grid gap-4" onSubmit={(e) => { e.preventDefault(); if (!mismatch) reset.mutate({ body: { token: params.get("token") ?? "", password: pw } }); }}>
          <Field label="New password"><Input type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Repeat password" error={mismatch ? "Passwords do not match" : null}><Input type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          {reset.error && <p className="text-sm text-destructive">{errorMessage(reset.error)}</p>}
          <Button type="submit" size="lg" loading={reset.isPending} disabled={mismatch}>Save password</Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPage() {
  return (
    <React.Suspense>
      <ResetForm />
    </React.Suspense>
  );
}
