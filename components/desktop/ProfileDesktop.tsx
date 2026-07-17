"use client";

/**
 * Profile & settings, desktop (spec D9) — a two-column settings layout:
 * slim section list on the left, the active panel on the right.
 */

import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useProfileSettings, type ProfileSection } from "@/components/screens/useProfileSettings";
import { VoiceSection, PersonalSection, CloudSection } from "@/components/screens/ProfileSections";
import { IconSettings, IconUser, IconUpload } from "@/components/icons";

const SECTIONS: { id: ProfileSection; label: string; icon: typeof IconUser }[] = [
  { id: "voice", label: "Voice & speech", icon: IconSettings },
  { id: "personal", label: "Personal details", icon: IconUser },
  { id: "cloud", label: "Cloud backup", icon: IconUpload },
];

export default function ProfileDesktop() {
  const p = useProfileSettings();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-7">
      <header className="border-b border-line pb-5">
        <span className="eyebrow">Profile &amp; settings</span>
        <h1 className="mt-1 font-display text-4xl text-ink">Make Swaram yours</h1>
        <p className="mt-2 text-sm text-soft">
          Tune the voice, choose how I listen, and manage the details I use to auto-fill forms.
        </p>
      </header>

      <StatusAnnouncer message={p.status} tone={p.tone} />

      <div className="grid grid-cols-[220px_1fr] items-start gap-8">
        <nav aria-label="Settings sections" className="sticky top-24 flex flex-col gap-1.5">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const active = p.activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => p.setActiveSection(section.id)}
                aria-current={active ? "true" : undefined}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
                  active ? "bg-accent-soft text-accent" : "text-soft hover:bg-sunken hover:text-ink"
                }`}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                {section.label}
              </button>
            );
          })}
        </nav>

        <div>
          {p.activeSection === "voice" && <VoiceSection p={p} />}
          {p.activeSection === "personal" && <PersonalSection p={p} />}
          {p.activeSection === "cloud" && <CloudSection p={p} />}
        </div>
      </div>
    </div>
  );
}
