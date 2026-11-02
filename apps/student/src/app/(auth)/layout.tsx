"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Award, CheckCircle2, GraduationCap, PlayCircle } from "lucide-react";

const cards = [
  { icon: PlayCircle, title: "Watch", text: "Short lessons with a playlist" },
  { icon: CheckCircle2, title: "Practice", text: "Tasks reviewed by mentors" },
  { icon: Award, title: "Get certified", text: "Verified certificates" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col p-6 sm:p-10">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 p-1.5 text-white"><GraduationCap className="size-5" /></span> LMS
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="w-full max-w-sm">{children}</motion.div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-[#0b0b14] lg:block">
        <motion.div className="absolute top-10 left-10 size-[460px] rounded-full bg-primary/40 blur-[120px]" animate={{ x: [0, 90, 0], y: [0, 70, 0] }} transition={{ duration: 16, repeat: Infinity }} />
        <motion.div className="absolute right-0 bottom-0 size-[380px] rounded-full bg-fuchsia-500/30 blur-[120px]" animate={{ x: [0, -70, 0] }} transition={{ duration: 12, repeat: Infinity }} />
        <div className="relative flex h-full flex-col justify-center gap-5 p-16 text-white">
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md font-display text-4xl leading-tight font-bold">Your learning, one tab away.</motion.h2>
          {cards.map((c, i) => (
            <motion.div key={c.title} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.15 }}
              className="flex max-w-sm items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <span className="rounded-xl bg-white/10 p-3"><c.icon className="size-5" /></span>
              <span><b className="block">{c.title}</b><span className="text-sm text-white/70">{c.text}</span></span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
