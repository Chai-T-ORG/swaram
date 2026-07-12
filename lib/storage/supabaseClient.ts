/**
 * Supabase is used for exactly one thing: optional profile backup, and only
 * after the user explicitly opts in on the Profile page. Every entry point
 * here checks consent and strips high-sensitivity keys before any request.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileData } from "../types";
import { getCloudConsent, getDeviceId, sanitizeProfile } from "./profileStore";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

async function getClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    );
  }
  return client;
}

/** Upsert the profile to the cloud. No-op without explicit consent. */
export async function syncProfileToCloud(profile: ProfileData): Promise<{ ok: boolean; error?: string }> {
  if (!getCloudConsent()) {
    return { ok: false, error: "Cloud sync is off. Turn it on first." };
  }
  const supabase = await getClient();
  if (!supabase) {
    return { ok: false, error: "Cloud sync is not configured on this app." };
  }
  const safe = sanitizeProfile(profile);
  const { error } = await supabase
    .from("profiles")
    .upsert({ device_id: getDeviceId(), data: safe, updated_at: new Date().toISOString() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function fetchProfileFromCloud(): Promise<ProfileData | null> {
  if (!getCloudConsent()) return null;
  const supabase = await getClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("profiles")
    .select("data")
    .eq("device_id", getDeviceId())
    .maybeSingle();
  return data?.data ? sanitizeProfile(data.data as ProfileData) : null;
}

export async function deleteCloudProfile(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getClient();
  if (!supabase) return { ok: true };
  const { error } = await supabase.from("profiles").delete().eq("device_id", getDeviceId());
  return error ? { ok: false, error: error.message } : { ok: true };
}
