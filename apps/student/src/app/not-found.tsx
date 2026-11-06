import Link from "next/link";
import { Button } from "@lms/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="font-display text-8xl font-extrabold">4<span className="inline-block size-[0.62em] translate-y-[0.04em] rounded-full border-[0.12em] border-foreground bg-signal align-baseline" />4</div>
      <p className="font-display text-xl font-bold">This stop is not on the map</p>
      <p className="text-muted-foreground">This page does not exist.</p>
      <Button asChild><Link href="/">Go home</Link></Button>
    </div>
  );
}
