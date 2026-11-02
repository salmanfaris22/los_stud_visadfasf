"use client";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "@lms/api-client";
import { ConfirmProvider, ThemeProvider, Toaster } from "@lms/ui";
import { api } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 } } }),
  );
  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={qc}>
        <ApiProvider api={api}>
        <ConfirmProvider>
          {children}
          <Toaster richColors position="top-right" closeButton />
        </ConfirmProvider>
        </ApiProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
