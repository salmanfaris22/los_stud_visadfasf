"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { BrandMark } from "@lms/ui";

/** Sign in, register and password pages: the form in a card, centred on the page. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="map-grid flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="w-full max-w-md">
        <Link href="/" className="mb-7 flex items-center justify-center gap-2.5 font-display text-lg font-extrabold">
          <BrandMark /> Ai school
        </Link>
        <div className="rounded-[28px] border bg-card p-6 shadow-sm sm:p-8 dark:shadow-none">{children}</div>
      </motion.div>
    </div>
  );
}
