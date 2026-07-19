"use client";

/**
 * AppShell — switches between the two platform experiences. The mobile and
 * desktop trees are intentionally separate component sets, not one responsive
 * layout; useDevice() decides which one renders.
 */

import { type ReactNode } from "react";
import { useDevice } from "@/components/device/DeviceProvider";
import MobileShell from "@/components/mobile/MobileShell";
import DesktopShell from "@/components/desktop/DesktopShell";

export default function AppShell({ children }: { children: ReactNode }) {
  const device = useDevice();
  return device === "mobile" ? <MobileShell>{children}</MobileShell> : <DesktopShell>{children}</DesktopShell>;
}
