"use client";

import { useDevice } from "@/components/device/DeviceProvider";
import ProcessingDesktop from "@/components/desktop/ProcessingDesktop";
import ProcessingMobile from "@/components/mobile/ProcessingMobile";

export default function ProcessingPage() {
  const device = useDevice();
  return device === "mobile" ? <ProcessingMobile /> : <ProcessingDesktop />;
}
