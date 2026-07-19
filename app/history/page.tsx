"use client";

import { useDevice } from "@/components/device/DeviceProvider";
import HistoryDesktop from "@/components/desktop/HistoryDesktop";
import HistoryMobile from "@/components/mobile/HistoryMobile";

export default function HistoryPage() {
  const device = useDevice();
  return device === "mobile" ? <HistoryMobile /> : <HistoryDesktop />;
}
