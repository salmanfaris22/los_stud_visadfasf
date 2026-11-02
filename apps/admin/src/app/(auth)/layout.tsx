"use client";
import * as React from "react";
import { motion } from "motion/react";
import { BookOpenCheck, CalendarCheck2, GraduationCap, ShieldCheck } from "lucide-react";

const points = [
  { icon: BookOpenCheck, text: "Courses, videos and tasks in one place" },
  { icon: CalendarCheck2, text: "Live Google Meet classes with attendance" },
  { icon: ShieldCheck, text: "Roles and permissions for every team member" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[#0b0b14] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <motion.div
          className="absolute -top-32 -left-32 size-[520px] rounded-full bg-primary/40 blur-[120px]"
          animate={{ x: [0, 80, 0], y: [0, 60, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-24 bottom-0 size-[420px] rounded-full bg-fuchsia-500/30 blur-[120px]"
          animate={{ x: [0, -60, 0], y: [0, -40, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative flex items-center gap-2 font-display text-xl font-bold">
          <span className="rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 p-2"><GraduationCap className="size-5" /></span>
          LMS Admin
        </div>
        <div className="relative max-w-md">
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="font-display text-4xl leading-tight font-bold">
            Run your academy from one dashboard.
          </motion.h1>
          <ul className="mt-8 space-y-4">
            {points.map((p, i) => (
              <motion.li key={p.text} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.15 }} className="flex items-center gap-3 text-white/80">
                <span className="rounded-lg bg-white/10 p-2"><p.icon className="size-4" /></span>
                {p.text}
              </motion.li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/40">© {new Date().getFullYear()} LMS</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="w-full max-w-sm">
          {children}
        </motion.div>
      </div>
    </div>
  );
}
