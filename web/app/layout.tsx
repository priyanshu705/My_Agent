import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Agent — your personal AI operating system",
  description: "A voice-first personal assistant that thinks, acts on your PC and shows its work.",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#F7F8FC", width: "device-width", initialScale: 1, viewportFit: "cover" };

// Runs before paint so the saved theme (light by default, dark, or system) never flashes the wrong colours.
const THEME_BOOT = `try{var s=JSON.parse(localStorage.getItem("settings")||"{}");var t=s.theme||"light";if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body className="font-sans bg-bg text-ink">{children}</body>
    </html>
  );
}
