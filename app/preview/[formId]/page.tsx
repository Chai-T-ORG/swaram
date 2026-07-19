"use client";

import { useDevice } from "@/components/device/DeviceProvider";
import PreviewDesktop from "@/components/desktop/PreviewDesktop";
import PreviewMobile from "@/components/mobile/PreviewMobile";

export default function PreviewPage() {
  const device = useDevice();
  return device === "mobile" ? <PreviewMobile /> : <PreviewDesktop />;
}
