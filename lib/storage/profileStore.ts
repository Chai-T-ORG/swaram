/**
 * Saved profile lives in localStorage by default — on this device only.
 * High-sensitivity keys (Aadhaar, PAN, passport, voter ID) are rejected at
 * this layer so no code path can persist them, locally or in the cloud.
 */
import type { ProfileData } from "../types";

const PROFILE_KEY = "swaram_profile";
const CLOUD_CONSENT_KEY = "swaram_cloud_consent";
const DEVICE_ID_KEY = "swaram_device_id";

/** Keys that must never be persisted anywhere. Substring match, normalized. */
export const FORBIDDEN_PROFILE_KEYS = [
  "aadhaar",
  "aadhar",
  "adhar",
  "uidai",
  "pan_number",
  "pan_card",
  "passport",
  "voter",
  "ration",
  "driving_licence",
  "driving_license",
];

export function isForbiddenProfileKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "_");
  return FORBIDDEN_PROFILE_KEYS.some((bad) => normalized.includes(bad));
}

/** Strip forbidden keys and empty values from a candidate profile object. */
export function sanitizeProfile(data: ProfileData): ProfileData {
  const clean: ProfileData = {};
  for (const [key, value] of Object.entries(data)) {
    if (!value || !value.trim()) continue;
    if (isForbiddenProfileKey(key)) continue;
    clean[key] = value.trim();
  }
  return clean;
}

export function getProfile(): ProfileData {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? sanitizeProfile(JSON.parse(raw) as ProfileData) : {};
  } catch {
    return {};
  }
}

export function setProfile(data: ProfileData): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(sanitizeProfile(data)));
}

export function mergeIntoProfile(updates: ProfileData): ProfileData {
  const merged = { ...getProfile(), ...sanitizeProfile(updates) };
  setProfile(merged);
  return merged;
}

export function clearProfile(): void {
  localStorage.removeItem(PROFILE_KEY);
}

export function getCloudConsent(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CLOUD_CONSENT_KEY) === "yes";
}

export function setCloudConsent(consented: boolean): void {
  localStorage.setItem(CLOUD_CONSENT_KEY, consented ? "yes" : "no");
}

/** Stable anonymous id used as the primary key for optional cloud sync. */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
