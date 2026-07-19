"use client";

import { useDevice } from "@/components/device/DeviceProvider";
import HomeDesktop from "@/components/desktop/HomeDesktop";
import HomeMobile from "@/components/mobile/HomeMobile";

export default function HomePage() {
  const device = useDevice();
  return device === "mobile" ? <HomeMobile /> : <HomeDesktop />;
}
