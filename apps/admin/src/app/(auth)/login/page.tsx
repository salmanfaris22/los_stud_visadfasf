"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { errorMessage } from "@lms/api-client";
import { Button, Field, Input, Separator } from "@lms/ui";
import { $api } from "@/lib/api";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.7 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState(params.get("error"));
  const providers = $api.useQuery("get", "/api/v1/auth/providers");
  const login = $api.useMutation("post", "/api/v1/auth/login", {
    onSuccess: () => router.replace(params.get("next") || "/dashboard"),
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Welcome back</h2>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to the admin & staff portal.</p>
      <form
        className="mt-8 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          login.mutate({ body: { email, password } });
        }}
      >
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@institute.com" />
        </Field>
        <Field label={<span className="flex w-full justify-between">Password <Link href="/forgot-password" className="font-normal text-primary">Forgot?</Link></span>}>
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" size="lg" loading={login.isPending}>Sign in</Button>
      </form>
      {providers.data?.google && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><Separator className="flex-1" /> or <Separator className="flex-1" /></div>
          <Button variant="outline" size="lg" className="w-full" asChild>
            <a href="/api/v1/auth/google/start?app=admin"><GoogleIcon /> Continue with Google</a>
          </Button>
        </>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginForm />
    </React.Suspense>
  );
}
