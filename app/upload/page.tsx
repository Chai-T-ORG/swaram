"use client";

import { useDevice } from "@/components/device/DeviceProvider";
import UploadDesktop from "@/components/desktop/UploadDesktop";
import UploadMobile from "@/components/mobile/UploadMobile";

export default function UploadPage() {
  const device = useDevice();
  return device === "mobile" ? <UploadMobile /> : <UploadDesktop />;
}
