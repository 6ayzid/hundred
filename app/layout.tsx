import type { Metadata } from "next";
import {
  Caveat,
  Fredoka,
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

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
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
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="20" fill="#ff8fab" stroke="#fff8f0" stroke-width="4"/><circle cx="15" cy="16" r="3" fill="#ffe599"/><circle cx="50" cy="14" r="2.5" fill="#ffe599"/><text x="32" y="41" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="800" fill="#fffaf5">100</text></svg>';

export const metadata: Metadata = {
  title: "হানডেট HUNDRED",
  description:
    "হানডেট (HUNDRED) — 4-player Bangladeshi tabletop card game with multiplayer sync and voice chat.",
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
      className={`${caveat.variable} ${fredoka.variable} ${patrickHand.variable} ${notoSansBengali.variable} ${silkscreen.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden bg-[#fff4ee] font-sans text-[#4a2e2b]">
        {children}
      </body>
    </html>
  );
}
