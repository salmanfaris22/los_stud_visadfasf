"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "@lms/api-client";
import { ConfirmProvider, ThemeProvider, Toaster } from "@lms/ui";
import { api } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 } } }));
  // The student portal (/learn) is black only; the public website keeps its light/dark choice.
  const portal = usePathname()?.startsWith("/learn");
  return (
    <ThemeProvider defaultTheme="light" forcedTheme={portal ? "dark" : undefined}>
      <QueryClientProvider client={qc}>
        <ApiProvider api={api}>
          <ConfirmProvider>
            {children}
            <Toaster richColors position="top-center" closeButton />
          </ConfirmProvider>
        </ApiProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
