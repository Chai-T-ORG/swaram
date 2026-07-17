"use client";

import { useDevice } from "@/components/device/DeviceProvider";
import ScanDesktop from "@/components/desktop/ScanDesktop";
import ScanMobile from "@/components/mobile/ScanMobile";

export default function ScanPage() {
  const device = useDevice();
  return device === "mobile" ? <ScanMobile /> : <ScanDesktop />;
}
