"use client";

/**
 * AppShell — switches between the two platform experiences. The mobile and
 * desktop trees are intentionally separate component sets, not one responsive
 * layout; useDevice() decides which one renders.
 */

import { type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useDevice } from "@/components/device/DeviceProvider";

// Code-split the two platform shells so a client downloads only the tree it
// renders. The device is chosen server-side (layout.tsx), so the matching shell
// is what SSRs; the other chunk is fetched only if matchMedia later flips the
// device. ssr stays on (default) to keep the server-rendered first paint.
const MobileShell = dynamic(() => import("@/components/mobile/MobileShell"));
const DesktopShell = dynamic(() => import("@/components/desktop/DesktopShell"));

export default function AppShell({ children }: { children: ReactNode }) {
  const device = useDevice();
  return device === "mobile" ? <MobileShell>{children}</MobileShell> : <DesktopShell>{children}</DesktopShell>;
}
