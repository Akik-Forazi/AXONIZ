import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/axoniz/theme-provider";
import { QueryProvider } from "@/components/axoniz/query-provider";
import { TelemetryProvider } from "@/components/axoniz/telemetry-provider";

// No Google Fonts — uses system fonts instead (no network call needed).
// This prevents the Turbopack "Can't resolve @vercel/turbopack-next/
// internal/font/google/font" error when offline.
// If you want custom fonts, download them locally and use next/font/local.

export const metadata: Metadata = {
  title: "AXONIZ — Autonomous Local Agentic System",
  description:
    "100% offline agentic intelligence. Command million-line codebases with small local models. Zero overhead, lethal precision, absolute loyalty.",
  keywords: [
    "AXONIZ",
    "autonomous agent",
    "local LLM",
    "llama.cpp",
    "code intelligence",
    "agentic framework",
    "offline AI",
  ],
  authors: [{ name: "Akik Faraji — Fraziym Tech & AI" }],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "AXONIZ — Autonomous Local Agentic System",
    description:
      "100% offline agentic intelligence. Command million-line codebases with small local models.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased dark" style={{ fontSize: '15px' }}>
        <ThemeProvider>
          <QueryProvider>
            <TelemetryProvider enabled={true}>
              {children}
              <Toaster />
              <SonnerToaster />
            </TelemetryProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
