"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TRPCProvider } from "@/lib/trpc/provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <TRPCProvider>
        <TooltipProvider delay={200}>{children}</TooltipProvider>
      </TRPCProvider>
      <Toaster position="top-right" richColors closeButton />
    </ThemeProvider>
  );
}
