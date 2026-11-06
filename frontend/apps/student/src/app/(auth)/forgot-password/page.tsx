"use client";
import * as React from "react";
import Link from "next/link";
import { AuthService, errorMessage, useRpcMutation } from "@lms/api-client";
import { Button, Field, Input } from "@lms/ui";

export default function ForgotPage() {
  const [email, setEmail] = React.useState("");
  const forgot = useRpcMutation(AuthService.method.forgotPassword);
  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Reset your password</h2>
      <p className="mt-1 text-sm text-muted-foreground">We'll email you a link to choose a new one.</p>
      {forgot.isSuccess ? (
        <p className="mt-8 rounded-lg bg-success/10 p-4 text-sm text-success">{forgot.data.message}</p>
      ) : (
        <form className="mt-8 grid gap-4" onSubmit={(e) => { e.preventDefault(); forgot.mutate({ email }); }}>
          <Field label="Email" error={forgot.error ? errorMessage(forgot.error) : null}>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" loading={forgot.isPending}>Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm"><Link href="/login" className="font-semibold underline decoration-signal decoration-2 underline-offset-4 hover:decoration-foreground">Back to sign in</Link></p>
    </div>
  );
}
