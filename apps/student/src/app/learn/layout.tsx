import type { Metadata } from "next";
import { LearnShell } from "@/components/learn/shell";

export const metadata: Metadata = { title: "My learning", robots: { index: false } };

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <LearnShell>{children}</LearnShell>;
}
