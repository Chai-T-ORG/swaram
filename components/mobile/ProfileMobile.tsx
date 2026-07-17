"use client";

/**
 * Profile & settings, mobile (spec M9) — chip tabs, one stacked section at a
 * time, Voice & speech first. Roomy touch targets throughout.
 */

import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useProfileSettings, type ProfileSection } from "@/components/screens/useProfileSettings";
import { VoiceSection, PersonalSection, CloudSection } from "@/components/screens/ProfileSections";

const SECTIONS: { id: ProfileSection; label: string }[] = [
  { id: "voice", label: "Voice & speech" },
  { id: "personal", label: "My details" },
  { id: "cloud", label: "Backup" },
];

export default function ProfileMobile() {
  const p = useProfileSettings();

  return (
    <div className="flex flex-col gap-5 pb-6">
      <header>
        <span className="eyebrow">Profile &amp; settings</span>
        <h1 className="mt-1 font-display text-[1.75rem] leading-tight text-ink">Make Swaram yours</h1>
      </header>

      <div role="tablist" aria-label="Settings sections" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            role="tab"
            aria-selected={p.activeSection === section.id}
            onClick={() => p.setActiveSection(section.id)}
            className={`shrink-0 cursor-pointer rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
              p.activeSection === section.id ? "bg-accent text-on-accent" : "bg-sunken text-soft"
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      <StatusAnnouncer message={p.status} tone={p.tone} />

      {p.activeSection === "voice" && <VoiceSection p={p} />}
      {p.activeSection === "personal" && <PersonalSection p={p} />}
      {p.activeSection === "cloud" && <CloudSection p={p} />}
    </div>
  );
}
