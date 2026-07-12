import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Swaram — Accessible Form Assistant",
    short_name: "Swaram",
    description:
      "Voice-first form filling for blind and low-vision users. We read forms out loud, ask each question, and fill it for you — on your device.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f8fc",
    theme_color: "#4f46e5",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
