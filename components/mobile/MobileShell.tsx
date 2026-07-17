"use client";

/**
 * MobileShell — the app-like mobile experience.
 *
 * A minimal sticky top bar, a single scrolling column, and a bottom tab bar
 * whose raised center slot is the voice orb (the app's primary control,
 * always under the thumb). Safe-area aware. `exclusive` pages (the fill
 * loop) hide both bars and own the full viewport.
 */

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVoice, useVoiceShell } from "@/components/voice/VoiceProvider";
import VoiceControl from "@/components/voice/VoiceControl";
import ConsentDialog from "@/components/voice/ConsentDialog";
import { IconWave, IconSun, IconMoon, IconHome, IconDoc, IconCamera, IconUser } from "@/components/icons";

const LEFT_TABS = [
  { label: "Home", href: "/", icon: IconHome },
  { label: "My Forms", href: "/history", icon: IconDoc },
];

const RIGHT_TABS = [
  { label: "Scan", href: "/scan", icon: IconCamera },
  { label: "Profile", href: "/profile", icon: IconUser },
];

function TabLink({ label, href, icon: Icon }: { label: string; href: string; icon: typeof IconHome }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl no-underline transition-colors ${
        active ? "text-accent" : "text-soft"
      }`}
    >
      <Icon className="h-5.5 w-5.5" aria-hidden="true" />
      <span className="text-[10px] font-bold">{label}</span>
    </Link>
  );
}

export default function MobileShell({ children }: { children: ReactNode }) {
  const voice = useVoice();
  const { exclusive, theme, toggleTheme } = useVoiceShell();
  const toast = voice?.toast ?? "";

  return (
    <div className="flex h-dvh w-full flex-col bg-surface text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-accent focus:px-5 focus:py-2.5 focus:text-sm focus:font-bold focus:text-on-accent"
      >
        Skip to content
      </a>

      {!exclusive && (
        <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-line bg-surface/85 px-5 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md">
          <Link href="/" className="flex items-center gap-2.5 text-ink no-underline">
            <span className="grid h-8.5 w-8.5 place-items-center rounded-full bg-accent text-on-accent shadow-sm">
              <IconWave className="h-4.5 w-4.5" />
            </span>
            <span className="font-display text-lg tracking-tight">Swaram</span>
          </Link>
          <button
            onClick={toggleTheme}
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-raised text-soft shadow-sm cursor-pointer"
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? <IconMoon className="h-4.5 w-4.5" /> : <IconSun className="h-4.5 w-4.5" />}
          </button>
        </header>
      )}

      <div className={exclusive ? "flex flex-1 flex-col overflow-hidden" : "relative flex-1 overflow-y-auto"}>
        <main
          id="main"
          className={
            exclusive
              ? "flex h-full w-full flex-1 flex-col overflow-hidden"
              : "w-full px-5 pb-10 pt-6"
          }
        >
          {children}
        </main>
      </div>

      {!exclusive && (
        <nav
          aria-label="Main"
          className="relative z-30 shrink-0 border-t border-line bg-raised/95 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur"
        >
          {/* Live transcript / status toast floats just above the tab bar */}
          {toast && (
            <div className="pointer-events-none absolute -top-12 left-1/2 w-max max-w-[calc(100vw-3rem)] -translate-x-1/2 truncate rounded-full border border-line bg-raised/95 px-4 py-2 text-xs font-semibold text-soft shadow-md backdrop-blur">
              {toast}
            </div>
          )}
          <div className="flex items-end justify-between gap-1">
            {LEFT_TABS.map((tab) => (
              <TabLink key={tab.href} {...tab} />
            ))}
            <div className="-mt-8 flex flex-1 justify-center">
              <VoiceControl variant="fab" />
            </div>
            {RIGHT_TABS.map((tab) => (
              <TabLink key={tab.href} {...tab} />
            ))}
          </div>
        </nav>
      )}

      <ConsentDialog variant="sheet" />
    </div>
  );
}
