"use client";
import * as React from "react";
import { animate, motion, useInView } from "motion/react";

/** Fades/slides children in when they scroll into view. */
export function Reveal({ children, delay = 0, y = 24, className }: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, delay, ease: [0.21, 0.6, 0.35, 1] }}>
      {children}
    </motion.div>
  );
}

/** Counts up to the number inside a label like "12k+" or "95%" when visible. */
export function CountUp({ value }: { value: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const m = /^([^\d]*)([\d.]+)(.*)$/.exec(value);
  React.useEffect(() => {
    if (!inView || !m || !ref.current) return;
    const target = parseFloat(m[2]!);
    const decimals = m[2]!.includes(".") ? 1 : 0;
    const ctrl = animate(0, target, { duration: 1.6, ease: "easeOut", onUpdate: (v) => { if (ref.current) ref.current.textContent = `${m[1]}${v.toFixed(decimals)}${m[3]}`; } });
    return () => ctrl.stop();
  }, [inView]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref}>{m ? `${m[1]}0${m[3]}` : value}</span>;
}
