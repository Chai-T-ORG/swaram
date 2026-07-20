import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";
import SetupOverlay from "@/components/SetupOverlay";
import VoiceProvider from "@/components/voice/VoiceProvider";
import { DeviceProvider } from "@/components/device/DeviceProvider";
import AppShell from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF7F1" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-side device hint: the initial render (server AND first client
  // render) uses this verbatim so hydration always matches; DeviceProvider
  // refines it with matchMedia after mount. Tablets get the desktop stage.
  const { device } = userAgent({ headers: await headers() });
  const initialDevice = device.type === "mobile" ? "mobile" : "desktop";

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full bg-surface text-ink" suppressHydrationWarning>
        <DeviceProvider initialDevice={initialDevice}>
          <VoiceProvider>
            <SetupOverlay />
            <AppShell>{children}</AppShell>
          </VoiceProvider>
        </DeviceProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
