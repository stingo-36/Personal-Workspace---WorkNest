import type { Metadata, Viewport } from "next";
import {
  DM_Serif_Display,
  Geist,
  Geist_Mono,
  Plus_Jakarta_Sans,
} from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

/**
 * Type — design.md §6. Geist is the app UI face (2026-09-28 refresh, per the
 * taste + redesign skills): a crisp neo-grotesk with real Medium/SemiBold
 * steps, so dense 13-14px labels keep a clear hierarchy. Geist Mono carries
 * ticket IDs, timestamps and code, and shares Geist's metrics.
 *
 * Plus Jakarta Sans stays loaded for the PUBLIC pages only (homepage, login,
 * register), which reference `--font-jakarta` directly; its italic file is loaded
 * so italic text isn't a synthesised oblique.
 *
 * Self-hosted by `next/font` (no Google request at runtime, no layout shift).
 */
const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

/** Ticket IDs, timestamps, saved commands. Ligatures are switched off in CSS. */
const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-jakarta",
});

/**
 * Display serif for the public pages (homepage, login, register) — matches the
 * user's "Take it to the next level" banner: sturdy, high-contrast, one weight.
 */
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-dm-serif",
});

export const metadata: Metadata = {
  title: {
    default: "WorkNest",
    template: "%s · WorkNest",
  },
  description:
    "Daily work logs, meeting notes, and ticket updates in one focused WorkNest.",
};

export const viewport: Viewport = {
  // Light-only site: the mobile browser chrome always matches the white page.
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full ${geist.variable} ${geistMono.variable} ${jakarta.variable} ${dmSerif.variable}`}
    >
      <body className="flex min-h-full flex-col bg-bg text-text">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
