"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { BrandMark, TransitArt } from "@lms/ui";

const route = [
  { title: "Watch", text: "Short lessons in a playlist" },
  { title: "Practice", text: "Tasks reviewed by mentors" },
  { title: "Get certified", text: "Verified certificates" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col p-6 sm:p-10">
        <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-extrabold">
          <BrandMark /> LMS
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="w-full max-w-sm">{children}</motion.div>
        </div>
      </div>
      <div className="relative hidden p-3 lg:block">
        <div className="map-grid relative flex h-full flex-col overflow-hidden rounded-[28px] border bg-card">
          <TransitArt className="absolute -top-[6%] -right-[12%] h-[78%] w-auto opacity-95" />
          <div className="relative mt-auto p-12">
            <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="max-w-md font-display text-[40px] leading-[1.05] font-extrabold">
              Your learning, one stop at a time.
            </motion.h2>
            <ol className="mt-8 max-w-sm">
              {route.map((c, i) => (
                <motion.li key={c.title} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + i * 0.15 }} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < route.length - 1 && <span aria-hidden className="absolute top-5 bottom-0 left-[9px] w-1 rounded-full" style={{ background: "var(--line-1)" }} />}
                  <span className={i === route.length - 1 ? "relative mt-0.5 size-[22px] shrink-0 rounded-full border-[5px] border-foreground bg-signal" : "relative mt-0.5 size-[22px] shrink-0 rounded-full border-[5px] border-foreground bg-card"} />
                  <span><b className="block">{c.title}</b><span className="text-sm text-muted-foreground">{c.text}</span></span>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
