import Link from "next/link";
import { Button } from "@lms/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="font-display text-7xl font-extrabold text-primary">404</div>
      <p className="text-muted-foreground">This page does not exist.</p>
      <Button asChild><Link href="/">Go home</Link></Button>
    </div>
  );
}
