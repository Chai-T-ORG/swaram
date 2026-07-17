"use client";

import { useDevice } from "@/components/device/DeviceProvider";
import ProfileDesktop from "@/components/desktop/ProfileDesktop";
import ProfileMobile from "@/components/mobile/ProfileMobile";

export default function ProfilePage() {
  const device = useDevice();
  return device === "mobile" ? <ProfileMobile /> : <ProfileDesktop />;
}
