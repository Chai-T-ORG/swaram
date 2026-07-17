"use client";

/**
 * My Forms, desktop (spec D10) — a quiet archive: search, filter tabs, and
 * card rows with Continue / Download / Speech log / Delete. Everything stays
 * on this device, and the page says so.
 */

import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { StatusChip } from "@/components/ui/StatusChip";
import ConversationLog from "@/components/ui/ConversationLog";
import {
  useHistory,
  hasConvLog,
  HISTORY_FILTERS,
} from "@/components/screens/useHistory";
import { routeForForm, formProgress } from "@/components/screens/useHomeData";
import {
  IconDoc,
  IconTrash,
  IconDownload,
  IconPlay,
  IconWave,
  IconSearch,
} from "@/components/icons";

export default function HistoryDesktop() {
  const h = useHistory();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-7">
      <header className="flex items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <span className="eyebrow">My forms</span>
          <h1 className="mt-1 font-display text-4xl text-ink">Your forms</h1>
          <p className="mt-2 text-sm text-soft">Stored only on this device.</p>
        </div>
        <div className="relative w-72">
          <IconSearch className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by name…"
            aria-label="Search forms by name"
            value={h.searchQuery}
            onChange={(e) => h.setSearchQuery(e.target.value)}
            className="field-input min-h-11 pl-10 pr-4 text-sm"
          />
        </div>
      </header>

      <StatusAnnouncer message={h.status} tone={h.tone} />

      {h.forms === null ? (
        <p className="animate-pulse py-16 text-center text-sm font-semibold text-soft">Loading your forms…</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div role="tablist" aria-label="Filter forms" className="flex gap-1.5">
              {HISTORY_FILTERS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={h.activeFilter === tab.id}
                  onClick={() => h.setActiveFilter(tab.id)}
                  className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    h.activeFilter === tab.id
                      ? "bg-accent text-on-accent"
                      : "bg-sunken text-soft hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-faint">
              {h.totalCount} total · {h.inProgressCount} in progress · {h.completedCount} complete
            </p>
          </div>

          {h.filtered.length === 0 ? (
            <div className="card flex flex-col items-center gap-5 py-16 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
                <IconDoc className="h-7 w-7" />
              </span>
              <div>
                <p className="font-display text-xl text-ink">Nothing here yet</p>
                <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-soft">
                  Upload a PDF or scan a paper form to get started.
                </p>
              </div>
              <div className="flex gap-3">
                <Link href="/upload" className="btn-primary no-underline">
                  Upload a form
                </Link>
                <Link href="/scan" className="btn-secondary no-underline">
                  Scan a paper form
                </Link>
              </div>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Form history">
              {h.filtered.map((form) => {
                const pct = formProgress(form);
                return (
                  <li key={form.id} className="card flex flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 gap-3.5">
                        <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sunken text-soft">
                          <IconDoc className="h-5.5 w-5.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-[15px] font-bold leading-tight text-ink">{form.name}</h2>
                          <p className="mt-1 text-xs text-faint">
                            {new Date(form.createdAt).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {" · "}
                            {form.fields.length} fields ({pct}% answered)
                          </p>
                        </div>
                      </div>
                      <StatusChip status={form.status} />
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
                      <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 border-t border-line/65 pt-3.5">
                      <Link href={routeForForm(form)} className="btn-primary min-h-11 px-5 text-xs no-underline">
                        <IconPlay className="h-3.5 w-3.5 fill-current" />
                        {form.status === "complete" ? "Open" : "Continue"}
                      </Link>

                      {form.status === "complete" && (
                        <button
                          type="button"
                          className="btn-secondary min-h-11 px-4 text-xs"
                          onClick={() => h.downloadFilled(form)}
                        >
                          <IconDownload className="h-3.5 w-3.5" />
                          Filled PDF
                        </button>
                      )}

                      {hasConvLog(form.id) && (
                        <button
                          type="button"
                          className="btn-secondary min-h-11 px-4 text-xs"
                          onClick={() => h.toggleExpandLog(form.id)}
                          aria-expanded={h.expandedFormId === form.id}
                        >
                          <IconWave className="h-3.5 w-3.5" />
                          {h.expandedFormId === form.id ? "Hide speech log" : "Speech log"}
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn-danger min-h-11 px-4 text-xs sm:ml-auto"
                        onClick={() => h.remove(form)}
                        aria-label={`Delete ${form.name}`}
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>

                    {h.expandedFormId === form.id && <ConversationLog formId={form.id} />}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
