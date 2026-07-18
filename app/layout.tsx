import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";
import GlobalVoice from "@/components/GlobalVoice";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Swaram — Your voice. Our help.",
  description:
    "Accessible, voice-first form assistant for blind and low-vision users. We read forms out loud, ask each question, and fill it for you — entirely on your device.",
  applicationName: "Swaram",
  manifest: "/manifest.json",
  // Renders <meta name="apple-mobile-web-app-title" content="Swaram" /> (plus
  // apple-mobile-web-app-capable) for the iOS home-screen shortcut label.
  appleWebApp: {
    title: "Swaram",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon1.png", type: "image/png", sizes: "32x32" },
      { url: "/web-app-manifest-192x192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  // favicon.ico, icon0.svg, icon1.png and apple-icon.png live in app/ and are
  // auto-detected + injected into <head> by Next.js's metadata file convention.
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="h-full bg-surface text-ink" suppressHydrationWarning>
        <GlobalVoice>
          {children}
        </GlobalVoice>
        <RegisterSW />
      </body>
    </html>
  );
}
