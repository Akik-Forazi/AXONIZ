import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/axoniz/theme-provider";
import { QueryProvider } from "@/components/axoniz/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
      >
        <ThemeProvider>
          <QueryProvider>
            {children}
            <Toaster />
            <SonnerToaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
