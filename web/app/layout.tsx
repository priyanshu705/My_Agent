import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Agent — your personal AI assistant",
  description: "A voice-first personal assistant that thinks, acts on your PC and shows its work live.",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#04060d", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} data-accent="cyan">
      <body className="font-sans bg-ink-950 text-slate-100">{children}</body>
    </html>
  );
}
