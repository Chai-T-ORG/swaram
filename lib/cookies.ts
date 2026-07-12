/**
 * Tiny cookie helper. Used to remember, across reloads, that the user has
 * already granted microphone permission and finished setup — so we never
 * re-prompt or re-run the setup overlay unnecessarily.
 *
 * Note: the browser itself persists the actual OS-level mic grant, but only
 * on a secure origin (https:// or http://localhost). On a plain LAN IP over
 * http the grant is not remembered by the browser — deploy over https (or use
 * localhost) for the permission to truly stick between reloads.
 */

export function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}
