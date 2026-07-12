"use client";

import { useEffect } from "react";

/** Registers the service worker that caches the OCR/PDF engines for offline use. */
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline caching is a nice-to-have; the app works without it.
      });
    }
  }, []);
  return null;
}
