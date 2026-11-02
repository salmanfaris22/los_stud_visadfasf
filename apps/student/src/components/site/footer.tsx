import Link from "next/link";
import { Instagram, Linkedin, Mail, MapPin, Phone, Youtube } from "lucide-react";
import { Brand } from "./navbar";

type FooterData = { about?: string; email?: string; phone?: string; address?: string; instagram?: string; youtube?: string; linkedin?: string };

export function Footer({ name, logo, data }: { name: string; logo?: string; data: FooterData }) {
  return (
    <footer className="border-t bg-sidebar">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Brand name={name} logo={logo} />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">{data.about}</p>
          <div className="mt-4 flex gap-3 text-muted-foreground">
            {data.instagram && <a href={data.instagram} aria-label="Instagram" className="hover:text-foreground"><Instagram className="size-5" /></a>}
            {data.youtube && <a href={data.youtube} aria-label="YouTube" className="hover:text-foreground"><Youtube className="size-5" /></a>}
            {data.linkedin && <a href={data.linkedin} aria-label="LinkedIn" className="hover:text-foreground"><Linkedin className="size-5" /></a>}
          </div>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold">Explore</div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/courses" className="hover:text-foreground">All courses</Link></li>
            <li><Link href="/blog" className="hover:text-foreground">Blog</Link></li>
            <li><Link href="/contact" className="hover:text-foreground">Contact</Link></li>
            <li><Link href="/login" className="hover:text-foreground">Student login</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold">Contact</div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {data.email && <li className="flex items-center gap-2"><Mail className="size-4" /><a href={`mailto:${data.email}`}>{data.email}</a></li>}
            {data.phone && <li className="flex items-center gap-2"><Phone className="size-4" /><a href={`tel:${data.phone}`}>{data.phone}</a></li>}
            {data.address && <li className="flex items-center gap-2"><MapPin className="size-4" />{data.address}</li>}
          </ul>
        </div>
      </div>
      <div className="border-t py-5 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} {name}. All rights reserved.</div>
    </footer>
  );
}
