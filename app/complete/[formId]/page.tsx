"use client";

import { useDevice } from "@/components/device/DeviceProvider";
import CompleteDesktop from "@/components/desktop/CompleteDesktop";
import CompleteMobile from "@/components/mobile/CompleteMobile";

export default function CompletePage() {
  const device = useDevice();
  return device === "mobile" ? <CompleteMobile /> : <CompleteDesktop />;
}
