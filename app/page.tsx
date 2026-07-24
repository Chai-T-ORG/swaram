"use client";

import dynamic from "next/dynamic";
import { useDevice } from "@/components/device/DeviceProvider";

// Ship only the home tree this device renders; the other loads on demand if
// matchMedia flips the device after mount. ssr stays on for first paint.
const HomeDesktop = dynamic(() => import("@/components/desktop/HomeDesktop"));
const HomeMobile = dynamic(() => import("@/components/mobile/HomeMobile"));

export default function HomePage() {
  const device = useDevice();
  return device === "mobile" ? <HomeMobile /> : <HomeDesktop />;
}
