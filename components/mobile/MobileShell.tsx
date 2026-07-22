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
import AuroraField from "@/components/ui/AuroraField";

const LEFT_TABS = [
  { label: "Home", href: "/", icon: IconHome },
  { label: "My Forms", href: "/history", icon: IconDoc },
];

const RIGHT_TABS = [
  { label: "Scan", href: "/scan", icon: IconCamera },
  { label: "Profile", href: "/profile", icon: IconUser },
];

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

function TabLink({ label, href, icon: Icon }: { label: string; href: string; icon: typeof IconHome }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl no-underline transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        active ? "text-accent" : "text-soft hover:text-ink"
      }`}
    >
      {active && (
        <motion.div
          layoutId="active-mobile-tab-pill"
          className="absolute inset-0 rounded-xl bg-accent-soft/40 -z-10"
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
        />
      )}
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="text-[9px] font-bold tracking-tight">{label}</span>
    </Link>
  );
}

export default function MobileShell({ children }: { children: ReactNode }) {
  const voice = useVoice();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const { exclusive, theme, toggleTheme } = useVoiceShell();
  const toast = voice?.toast ?? "";

  const trans = prefersReducedMotion ? { duration: 0.05 } : { duration: 0.12, ease: "easeOut" as const };

  return (
    <div className="flex h-dvh w-full flex-col bg-surface text-ink relative z-10">
      <AuroraField />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-accent focus:px-5 focus:py-2.5 focus:text-sm focus:font-bold focus:text-on-accent"
      >
        Skip to content
      </a>

      {!exclusive && (
        <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-line bg-surface px-5 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <Link href="/" className="flex items-center gap-2.5 text-ink no-underline focus-visible:outline-2 focus-visible:outline-accent rounded-xl">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-xl object-contain shadow-xs" />
            <span className="font-display text-lg tracking-tight">Swaram</span>
          </Link>
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={toggleTheme}
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-raised text-soft shadow-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? <IconMoon className="h-4.5 w-4.5" /> : <IconSun className="h-4.5 w-4.5" />}
          </motion.button>
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
          <AnimatePresence mode="popLayout">
            <motion.div
              key={pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={trans}
              style={{ willChange: "opacity" }}
              className="w-full h-full flex flex-col flex-1"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {!exclusive && (
        <nav
          aria-label="Main"
          className="relative z-30 shrink-0 mx-auto w-[calc(100%-2rem)] max-w-md mb-[calc(1.25rem+env(safe-area-inset-bottom))] rounded-3xl glass-raised px-4 py-2.5"
        >
          {/* Live transcript / status toast floats just above the tab bar */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: 8, x: "-50%" }}
                animate={{ opacity: 1, y: 0, x: "-50%" }}
                exit={{ opacity: 0, y: 4, x: "-50%" }}
                className="pointer-events-none absolute -top-12 left-1/2 w-max max-w-[calc(100vw-3rem)] truncate rounded-full border border-line bg-raised px-4 py-2 text-xs font-semibold text-soft shadow-md"
              >
                {toast}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-end justify-between gap-1">
            {LEFT_TABS.map((tab) => (
              <TabLink key={tab.href} {...tab} />
            ))}
            <div className="-mt-9 flex flex-1 justify-center relative z-40">
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
