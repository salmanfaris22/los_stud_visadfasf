import Link from "next/link";
import { Instagram, Linkedin, Mail, MapPin, Phone, Youtube } from "lucide-react";
import { Brand } from "./navbar";

type FooterData = { about?: string; email?: string; phone?: string; address?: string; instagram?: string; youtube?: string; linkedin?: string };

const social = "flex size-10 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:border-[var(--site-violet-line)] hover:text-[var(--site-violet)]";
const link = "transition-colors hover:text-foreground";

export function Footer({ name, logo, data }: { name: string; logo?: string; data: FooterData }) {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Brand name={name} logo={logo} />
          {data.about && <p className="mt-4 max-w-sm text-[15px] leading-7 text-muted-foreground">{data.about}</p>}
          {(data.instagram || data.youtube || data.linkedin) && (
            <div className="mt-6 flex gap-2">
              {data.instagram && <a href={data.instagram} aria-label="Instagram" className={social}><Instagram className="size-4" /></a>}
              {data.youtube && <a href={data.youtube} aria-label="YouTube" className={social}><Youtube className="size-4" /></a>}
              {data.linkedin && <a href={data.linkedin} aria-label="LinkedIn" className={social}><Linkedin className="size-4" /></a>}
            </div>
          )}
        </div>
        <nav aria-label="Footer">
          <div className="mb-4 text-[15px] font-semibold">Explore</div>
          <ul className="space-y-3 text-[15px] text-muted-foreground">
            <li><Link href="/courses" className={link}>All courses</Link></li>
            <li><Link href="/blog" className={link}>Blog</Link></li>
            <li><Link href="/contact" className={link}>Contact</Link></li>
            <li><Link href="/login" className={link}>Student login</Link></li>
          </ul>
        </nav>
        <div>
          <div className="mb-4 text-[15px] font-semibold">Contact</div>
          <ul className="space-y-3 text-[15px] text-muted-foreground">
            {data.email && <li className="flex items-center gap-2.5"><Mail className="size-4 shrink-0" /><a href={`mailto:${data.email}`} className={link}>{data.email}</a></li>}
            {data.phone && <li className="flex items-center gap-2.5"><Phone className="size-4 shrink-0" /><a href={`tel:${data.phone}`} className={link}>{data.phone}</a></li>}
            {data.address && <li className="flex items-center gap-2.5"><MapPin className="size-4 shrink-0" />{data.address}</li>}
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-muted-foreground sm:px-6">© {new Date().getFullYear()} {name}. All rights reserved.</div>
      </div>
    </footer>
  );
}
