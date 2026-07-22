"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TRPCProvider } from "@/lib/trpc/provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <TRPCProvider>{children}</TRPCProvider>
      <Toaster position="top-right" richColors closeButton />
    </ThemeProvider>
  );
}
