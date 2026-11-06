"use client";
import * as React from "react";
import { motion } from "motion/react";
import { BookOpenCheck, CalendarCheck2, ShieldCheck } from "lucide-react";
import { BrandMark, TransitArt } from "@lms/ui";

const points = [
  { icon: BookOpenCheck, text: "Courses, videos and tasks in one place" },
  { icon: CalendarCheck2, text: "Live Google Meet classes with attendance" },
  { icon: ShieldCheck, text: "Roles and permissions for every team member" },
];

/* Admin sign-in: form on the left, the "control room" network map on the right. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center gap-2.5 font-display text-lg font-extrabold"><BrandMark /> LMS Admin</div>
        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="w-full max-w-sm">
            {children}
          </motion.div>
        </div>
      </div>
      <div className="relative hidden p-3 lg:block">
        {/* scoped to night tokens so it stays a dark control room in both themes */}
        <div className="dark map-grid relative flex h-full flex-col overflow-hidden rounded-[28px] bg-rail text-foreground">
          <TransitArt className="absolute -top-[8%] -right-[10%] h-[80%] w-auto" />
          <div className="relative mt-auto max-w-md p-12">
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }} className="font-display text-[40px] leading-[1.05] font-extrabold">
              Run every line of your academy.
            </motion.h1>
            <ul className="mt-8 space-y-3">
              {points.map((p, i) => (
                <motion.li key={p.text} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + i * 0.15 }} className="flex items-center gap-3 text-muted-foreground">
                  <span className="flex size-9 items-center justify-center rounded-full bg-signal text-signal-foreground"><p.icon className="size-4" /></span>
                  {p.text}
                </motion.li>
              ))}
            </ul>
            <p className="mt-10 text-sm text-muted-foreground/70">© {new Date().getFullYear()} LMS</p>
          </div>
        </div>
      </div>
    </div>
  );
}
