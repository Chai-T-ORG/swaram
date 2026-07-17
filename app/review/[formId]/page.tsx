"use client";

import { useDevice } from "@/components/device/DeviceProvider";
import ReviewDesktop from "@/components/desktop/ReviewDesktop";
import ReviewMobile from "@/components/mobile/ReviewMobile";

export default function ReviewPage() {
  const device = useDevice();
  return device === "mobile" ? <ReviewMobile /> : <ReviewDesktop />;
}
