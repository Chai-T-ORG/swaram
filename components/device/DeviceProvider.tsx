"use client";

/**
 * DeviceProvider — the single source of truth for which experience renders.
 *
 * The server guesses from the User-Agent (see app/layout.tsx) and passes the
 * guess as `initialDevice`; both the server render and the client's first
 * render use it verbatim, so hydration always matches. After mount, a
 * matchMedia listener refines the answer (a desktop window narrowed to phone
 * width gets the mobile experience, and vice versa) and tracks live resizes.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type DeviceKind = "mobile" | "desktop";

const DeviceContext = createContext<DeviceKind>("desktop");

const MOBILE_QUERY = "(max-width: 767px)";

export function DeviceProvider({
  initialDevice,
  children,
}: {
  initialDevice: DeviceKind;
  children: ReactNode;
}) {
  const [device, setDevice] = useState<DeviceKind>(initialDevice);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const apply = () => setDevice(mq.matches ? "mobile" : "desktop");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return <DeviceContext.Provider value={device}>{children}</DeviceContext.Provider>;
}

export function useDevice(): DeviceKind {
  return useContext(DeviceContext);
}
