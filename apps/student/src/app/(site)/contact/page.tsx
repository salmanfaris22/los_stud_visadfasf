import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";
import { LeadForm } from "@/components/site/lead-form";
import { getSite } from "@/lib/server-api";

export const metadata: Metadata = { title: "Contact", description: "Ask about courses, batches and fees." };

export default async function ContactPage() {
  const site = await getSite();
  const f = (site.blocks.footer ?? {}) as Record<string, string>;
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-32 pb-24 sm:px-6 lg:grid-cols-2">
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Let's talk</h1>
        <p className="mt-3 text-muted-foreground">Questions about a course, batch timings or fees? Send a message and our team will reach out.</p>
        <ul className="mt-8 space-y-4">
          {f.email && <li className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-3 text-primary"><Mail className="size-5" /></span><a href={`mailto:${f.email}`}>{f.email}</a></li>}
          {f.phone && <li className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-3 text-primary"><Phone className="size-5" /></span><a href={`tel:${f.phone}`}>{f.phone}</a></li>}
          {f.address && <li className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-3 text-primary"><MapPin className="size-5" /></span>{f.address}</li>}
        </ul>
      </div>
      <div className="rounded-3xl border bg-card p-6 shadow-xl sm:p-8"><LeadForm source="contact-page" /></div>
    </div>
  );
}
