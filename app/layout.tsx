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

export const metadata: Metadata = {
  title: "হানডেট HUNDRED",
  description:
    "হানডেট (HUNDRED) — 4-player Bangladeshi tabletop card game with multiplayer sync and voice chat.",
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
