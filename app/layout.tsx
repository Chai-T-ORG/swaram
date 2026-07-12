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
  manifest: "/manifest.webmanifest",
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
      <body className="h-full bg-surface text-ink">
        <GlobalVoice>
          {children}
        </GlobalVoice>
        <RegisterSW />
      </body>
    </html>
  );
}
