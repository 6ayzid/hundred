import type { Metadata } from "next";
import {
  Caveat,
  Noto_Sans_Bengali,
  Patrick_Hand,
  Silkscreen,
} from "next/font/google";
import "./globals.css";

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-caveat",
  display: "swap",
});

const patrickHand = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-patrick",
  display: "swap",
});

const notoSansBengali = Noto_Sans_Bengali({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bangla",
  display: "swap",
});

const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-pixel",
  display: "swap",
});

const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#232126" stroke="#e5b84b" stroke-width="4"/><text x="32" y="41" text-anchor="middle" font-family="serif" font-size="24" font-weight="bold" fill="#e5b84b">100</text></svg>';

export const metadata: Metadata = {
  title: "একশো HUNDRED",
  description:
    "হান্ডেট (Hundred) — 4-player UNO-inspired Bangladeshi top-down flat-lay card game with deterministic host failover and LiveKit voice chat.",
  icons: {
    icon: `data:image/svg+xml,${encodeURIComponent(ICON_SVG)}`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="bn"
      className={`${caveat.variable} ${patrickHand.variable} ${notoSansBengali.variable} ${silkscreen.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden bg-[#170f0a] font-sans text-[#f6efe2]">
        {children}
      </body>
    </html>
  );
}
