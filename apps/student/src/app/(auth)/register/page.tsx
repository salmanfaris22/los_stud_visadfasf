"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorMessage } from "@lms/api-client";
import { Button, Field, Input } from "@lms/ui";
import { $api } from "@/lib/api";
import { GoogleButton } from "../google";

export default function RegisterPage() {
  const router = useRouter();
  const [f, setF] = React.useState({ name: "", email: "", phone: "", password: "" });
  const providers = $api.useQuery("get", "/api/v1/auth/providers");
  const register = $api.useMutation("post", "/api/v1/auth/register", { onSuccess: () => router.replace("/learn") });
  if (providers.data && !providers.data.signup) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold">Sign-up is by invitation</h1>
        <p className="mt-3 text-sm text-muted-foreground">Your institute creates your account and emails you a link. <Link href="/contact" className="text-primary">Contact us</Link> to join a course.</p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-muted-foreground">Start learning in minutes.</p>
      <form className="mt-8 grid gap-4" onSubmit={(e) => { e.preventDefault(); register.mutate({ body: { ...f, phone: f.phone || undefined } }); }}>
        <Field label="Full name"><Input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
        <Field label="Email"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
        <Field label="Phone (optional)"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Field>
        <Field label="Password" hint="At least 8 characters"><Input type="password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
        {register.error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage(register.error)}</p>}
        <Button type="submit" size="lg" loading={register.isPending}>Create account</Button>
      </form>
      {providers.data?.google && <GoogleButton label="Sign up with Google" />}
      <p className="mt-6 text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="font-medium text-primary">Sign in</Link></p>
    </div>
  );
}
