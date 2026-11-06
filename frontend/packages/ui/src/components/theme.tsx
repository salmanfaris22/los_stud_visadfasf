"use client";
import * as React from "react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "./button";

export function ThemeProvider({ children, defaultTheme = "light" }: { children: React.ReactNode; defaultTheme?: "dark" | "light" | "system" }) {
  return (
    <NextThemes attribute="class" defaultTheme={defaultTheme} enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

/** Re-exported so apps can read or switch the theme without their own next-themes dependency. */
export { useTheme } from "next-themes";
