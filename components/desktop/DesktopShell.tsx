"use client";

/**
 * DesktopShell — the calm centered voice stage.
 *
 * A thin top bar (wordmark left; quiet nav + theme toggle right), a centered
 * main column, and the single docked VoiceControl at bottom-center. No
 * sidebar, no workflow stepper, no greeting banner, no footer — the screen
 * belongs to the current moment of the conversation. `exclusive` pages
 * (the fill loop) drop the chrome entirely and own the full viewport.
 */

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVoiceShell } from "@/components/voice/VoiceProvider";
import VoiceControl from "@/components/voice/VoiceControl";
import ConsentDialog from "@/components/voice/ConsentDialog";
import { IconWave, IconSun, IconMoon } from "@/components/icons";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "My Forms", href: "/history" },
  { label: "Profile", href: "/profile" },
];

export default function DesktopShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { exclusive, theme, toggleTheme } = useVoiceShell();
  // Home renders the hero voice control as its stage — the docked pill would
  // be a duplicate control there.
  const isHome = pathname === "/";

  return (
    <div className="flex h-dvh w-full flex-col bg-surface text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-accent focus:px-5 focus:py-2.5 focus:text-sm focus:font-bold focus:text-on-accent"
      >
        Skip to content
      </a>

      {!exclusive && (
        <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-line bg-surface/85 px-8 py-4 backdrop-blur-md">
          <Link
            href="/"
            className="flex items-center gap-3 text-ink no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-full"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-on-accent shadow-sm">
              <IconWave className="h-4.5 w-4.5" />
            </span>
            <span className="font-display text-xl tracking-tight">Swaram</span>
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1.5">
            {NAV_LINKS.map((link) => {
              const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm font-semibold no-underline transition-colors ${
                    active ? "bg-accent-soft text-accent" : "text-soft hover:bg-sunken hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <span className="mx-2 h-5 w-px bg-line" aria-hidden="true" />
            <button
              onClick={toggleTheme}
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-raised text-soft shadow-sm transition-colors hover:text-ink cursor-pointer"
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? <IconMoon className="h-4.5 w-4.5" /> : <IconSun className="h-4.5 w-4.5" />}
            </button>
          </nav>
        </header>
      )}

      <div className={exclusive ? "flex flex-1 flex-col overflow-hidden" : "flex-1 overflow-y-auto"}>
        <main
          id="main"
          className={
            exclusive
              ? "flex h-full w-full flex-1 flex-col overflow-hidden"
              : "mx-auto w-full max-w-5xl px-8 pb-44 pt-10"
          }
        >
          {children}
        </main>
      </div>

      {!exclusive && !isHome && <VoiceControl variant="docked" />}

      <ConsentDialog variant="modal" />
    </div>
  );
}
