"use client";

import { useDevice } from "@/components/device/DeviceProvider";
import FillDesktop from "@/components/desktop/FillDesktop";
import FillMobile from "@/components/mobile/FillMobile";

export default function FillPage() {
  const device = useDevice();
  return device === "mobile" ? <FillMobile /> : <FillDesktop />;
}
