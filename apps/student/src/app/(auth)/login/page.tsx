"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { errorMessage } from "@lms/api-client";
import { Button, Field, Input } from "@lms/ui";
import { $api } from "@/lib/api";
import { GoogleButton } from "../google";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState(params.get("error"));
  const providers = $api.useQuery("get", "/api/v1/auth/providers");
  const login = $api.useMutation("post", "/api/v1/auth/login", { onSuccess: () => router.replace(params.get("next") || "/learn"), onError: (e) => setError(errorMessage(e)) });
  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Welcome back 👋</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to continue learning.</p>
      <form className="mt-8 grid gap-4" onSubmit={(e) => { e.preventDefault(); setError(null); login.mutate({ body: { email, password } }); }}>
        <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={<span className="flex w-full justify-between">Password <Link href="/forgot-password" className="font-normal text-primary">Forgot?</Link></span>}>
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" loading={login.isPending}>Sign in</Button>
      </form>
      {providers.data?.google && <GoogleButton />}
      {providers.data?.signup && <p className="mt-6 text-center text-sm text-muted-foreground">New here? <Link href="/register" className="font-medium text-primary">Create an account</Link></p>}
    </div>
  );
}

export default function LoginPage() {
  return <React.Suspense><Form /></React.Suspense>;
}
