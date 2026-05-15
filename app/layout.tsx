import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { BottomTabBar } from "@/components/BottomTabBar";
import { TopBar } from "@/components/TopBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "cardIO",
  description: "Personal YGO & MTG card collection",
  appleWebApp: {
    capable: true,
    title: "cardIO",
    statusBarStyle: "default",
  },
};

// `viewportFit: "cover"` makes env(safe-area-inset-*) report real values on
// iOS standalone — used below by BottomTabBar to clear the home indicator.
// themeColor takes a light/dark pair so Android Chrome's status bar matches
// whichever scheme the user is in.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#18181b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <TopBar />
        {children}
        <BottomTabBar />
      </body>
    </html>
  );
}
