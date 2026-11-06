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
        <h1 className="font-display text-4xl font-extrabold sm:text-6xl">Let's talk</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">Questions about a course, batch timings or fees? Send a message and our team will reach out.</p>
        <ul className="mt-8 space-y-4">
          {f.email && <li className="flex items-center gap-4 font-medium"><span className="flex size-12 items-center justify-center rounded-full bg-foreground text-signal"><Mail className="size-5" /></span><a href={`mailto:${f.email}`}>{f.email}</a></li>}
          {f.phone && <li className="flex items-center gap-4 font-medium"><span className="flex size-12 items-center justify-center rounded-full bg-foreground text-signal"><Phone className="size-5" /></span><a href={`tel:${f.phone}`}>{f.phone}</a></li>}
          {f.address && <li className="flex items-center gap-4 font-medium"><span className="flex size-12 items-center justify-center rounded-full bg-foreground text-signal"><MapPin className="size-5" /></span>{f.address}</li>}
        </ul>
      </div>
      <div className="rounded-[28px] border bg-card p-6 shadow-xl sm:p-9 dark:shadow-none"><LeadForm source="contact-page" /></div>
    </div>
  );
}
