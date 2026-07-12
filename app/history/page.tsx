"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useVoicePage, type ConversationMessage } from "@/components/GlobalVoice";
import { deleteForm, getFile, listForms } from "@/lib/storage/localHistoryStore";
import type { FormRecord } from "@/lib/types";
import {
  IconArrowLeft,
  IconDoc,
  IconTrash,
  IconDownload,
  IconPlay,
  IconWave,
  IconSearch,
  IconCheck,
  IconHelp,
  IconClock,
  IconSparkle
} from "@/components/icons";

export default function HistoryPage() {
  const [forms, setForms] = useState<FormRecord[] | null>(null);
  const [status, setStatus] = useState("Your forms are stored only on this device.");
  const [tone, setTone] = useState<"info" | "success" | "warning" | "error">("info");
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "review" | "complete">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useVoicePage(
    {
      title: "My forms",
      hint:
        forms && forms.length > 0
          ? `You have ${forms.length} form${forms.length === 1 ? "" : "s"}. Say open the latest to continue it.`
          : "You have no forms yet. Say upload or scan to start one.",
      description:
        forms && forms.length > 0
          ? `My forms page. ${forms.map((f, i) => `${i + 1}: ${f.name}`).slice(0, 5).join(". ")}.`
          : "My forms page. It is empty.",
      commands: [
        [
          /open( the)? (latest|first|last)( form)?|continue/,
          () => {
            if (forms && forms[0]) window.location.href = routeForForm(forms[0]);
          },
          "open the latest",
        ],
      ],
    },
    [forms?.length],
  );

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      setForms(await listForms());
    } catch {
      setForms([]);
      setTone("error");
      setStatus("Could not read your form history.");
    }
  }

  async function remove(form: FormRecord) {
    if (!window.confirm(`Delete “${form.name}” and its files from this device?`)) return;
    await deleteForm(form.id);
    localStorage.removeItem("swaram_conv_" + form.id);
    setTone("success");
    setStatus(`Deleted ${form.name}.`);
    refresh();
  }

  async function downloadFilled(form: FormRecord) {
    const blob = await getFile(form.id, "filled");
    if (!blob) {
      setTone("warning");
      setStatus("This form does not have a filled PDF yet.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = form.name.replace(/\.(pdf|jpe?g|png)$/i, "") + " - filled.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  const toggleExpandLog = (formId: string) => {
    setExpandedFormId((prev) => (prev === formId ? null : formId));
  };

  const getFilteredForms = () => {
    if (!forms) return [];
    return forms.filter((form) => {
      const matchesSearch = form.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (activeFilter === "all") return true;
      if (activeFilter === "active") return form.status === "filling" || form.status === "ready" || form.status === "processing";
      if (activeFilter === "review") return form.status === "review";
      if (activeFilter === "complete") return form.status === "complete";
      return true;
    });
  };

  const filtered = getFilteredForms();

  // Statistics calculation
  const totalCount = forms?.length ?? 0;
  const completedCount = forms?.filter((f) => f.status === "complete").length ?? 0;
  const inProgressCount = forms?.filter((f) => f.status === "filling" || f.status === "ready").length ?? 0;

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto page-transition bg-surface">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="self-start">
          <Link href="/" className="link-plain inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
            <IconArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </nav>

        {/* Header Title */}
        <header className="border-b border-line pb-4 flex flex-col md:flex-row justify-between md:items-end gap-4 text-left">
          <div>
            <span className="eyebrow mb-1">Session Logs</span>
            <h1 className="font-display text-3xl font-extrabold text-ink tracking-tight">My Forms History</h1>
            <p className="text-xs text-soft font-semibold mt-1">
              Review and manage your local form filling workspace. All data stays strictly on your device.
            </p>
          </div>
          
          <div className="relative w-full md:w-72">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
            <input
              type="text"
              placeholder="Search forms by name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="field-input pl-9.5 pr-4 shadow-sm min-h-10 text-xs"
            />
          </div>
        </header>

        <StatusAnnouncer message={status} tone={tone} />

        {forms === null ? (
          <div className="flex flex-col items-center py-16 text-soft font-bold animate-pulse">
            Loading form archives…
          </div>
        ) : (
          <>
            {/* Stats Dashboard Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="card p-4.5 flex items-center gap-3.5 bg-raised text-left">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <IconDoc className="h-5.5 w-5.5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-soft leading-none">Total Sessions</h3>
                  <span className="font-display text-xl font-extrabold text-ink block mt-1">{totalCount}</span>
                </div>
              </div>
              <div className="card p-4.5 flex items-center gap-3.5 bg-raised text-left">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-ok-soft text-ok">
                  <IconCheck className="h-5.5 w-5.5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-soft leading-none">Completed</h3>
                  <span className="font-display text-xl font-extrabold text-ink block mt-1">{completedCount}</span>
                </div>
              </div>
              <div className="card p-4.5 flex items-center gap-3.5 bg-raised text-left">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-warn-soft text-warn">
                  <IconClock className="h-5.5 w-5.5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-soft leading-none">In Progress</h3>
                  <span className="font-display text-xl font-extrabold text-ink block mt-1">{inProgressCount}</span>
                </div>
              </div>
            </div>

            {/* Filter Tabs Row */}
            <div className="flex border-b border-line gap-2 overflow-x-auto pb-px">
              {[
                { id: "all", label: "All Sessions" },
                { id: "active", label: "In Progress" },
                { id: "review", label: "In Review" },
                { id: "complete", label: "Completed" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id as any)}
                  className={`px-4 py-2.5 font-bold text-xs whitespace-nowrap transition-all border-b-2 ${
                    activeFilter === tab.id
                      ? "border-accent text-accent"
                      : "border-transparent text-soft hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Forms List */}
            {filtered.length === 0 ? (
              <div className="card flex flex-col items-center gap-5 py-16 text-center border-line bg-raised">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <IconDoc className="h-7 w-7" />
                </span>
                <div>
                  <p className="text-base font-bold text-ink">No sessions found</p>
                  <p className="text-xs text-soft mt-0.5 max-w-xs leading-relaxed font-semibold">
                    No forms matched your selected filter. Start a new session or upload a form.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link href="/upload" className="btn btn-primary min-h-10 text-xs px-5 font-bold no-underline">
                    Upload a PDF
                  </Link>
                  <Link href="/scan" className="btn btn-secondary min-h-10 text-xs px-5 font-bold no-underline">
                    Scan paper form
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-4 list-none p-0 m-0" aria-label="Form history">
                {filtered.map((form) => {
                  const hasConvLog = typeof window !== "undefined" && !!localStorage.getItem("swaram_conv_" + form.id);
                  const answeredFields = form.fields.filter((f) => f.status === "answered" || f.status === "autofilled").length;
                  const pct = Math.round((answeredFields / Math.max(form.fields.length, 1)) * 100);

                  return (
                    <li key={form.id} className="card p-5 border-line bg-raised flex flex-col gap-4">
                      
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-left">
                        <div className="min-w-0 flex-1 flex gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent mt-0.5">
                            <IconDoc className="h-5.5 w-5.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-extrabold text-sm text-ink truncate leading-tight">{form.name}</h4>
                            <p className="text-xs text-soft font-semibold mt-1">
                              Modified: {new Date(form.createdAt).toLocaleString("en-IN", {
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
                        <StatusBadge status={form.status} />
                      </div>

                      {/* Session progress line */}
                      <div className="h-1.5 w-full bg-line rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 border-t border-line/65 pt-3.5">
                        <Link
                          href={routeForForm(form)}
                          className="btn btn-primary min-h-10 px-5 text-xs no-underline font-bold"
                        >
                          <IconPlay className="h-3.5 w-3.5 fill-current" />
                          {form.status === "complete" ? "Open Session" : "Continue"}
                        </Link>

                        {form.status === "complete" && (
                          <button
                            type="button"
                            className="btn btn-secondary min-h-10 px-4 text-xs font-bold"
                            onClick={() => downloadFilled(form)}
                          >
                            <IconDownload className="h-3.5 w-3.5" />
                            Filled PDF
                          </button>
                        )}

                        {hasConvLog && (
                          <button
                            type="button"
                            className="btn btn-secondary min-h-10 px-4 text-xs font-bold"
                            onClick={() => toggleExpandLog(form.id)}
                          >
                            <IconWave className="h-3.5 w-3.5" />
                            {expandedFormId === form.id ? "Hide Speech Log" : "View Speech Log"}
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-danger min-h-10 px-4 text-xs font-bold sm:ml-auto"
                          onClick={() => remove(form)}
                          aria-label={`Delete ${form.name}`}
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>

                      {/* Collapsible Speech Log bubbles */}
                      {expandedFormId === form.id && (
                        <div className="mt-2 p-4 border border-line rounded-2xl bg-surface/50 flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-2 animate-fade-in text-left">
                          <div className="flex items-center justify-between border-b border-line pb-2">
                            <span className="text-[10px] font-bold text-faint uppercase tracking-wider">Conversation Log</span>
                            <span className="text-[9px] text-faint">Stored on device</span>
                          </div>
                          {(() => {
                            const saved = localStorage.getItem("swaram_conv_" + form.id);
                            if (!saved) return <p className="text-xs text-soft font-semibold">No recordings found.</p>;
                            try {
                              const msgs: ConversationMessage[] = JSON.parse(saved);
                              if (msgs.length === 0) return <p className="text-xs text-soft font-semibold">No speech recorded yet.</p>;
                              return (
                                <div className="flex flex-col gap-4">
                                  {msgs.map((msg, idx) => {
                                    const isAssistant = msg.sender === "assistant";
                                    return (
                                      <div
                                        key={idx}
                                        className={`flex flex-col max-w-[85%] ${
                                          isAssistant ? "self-start items-start" : "self-end items-end"
                                        }`}
                                      >
                                        <span className="text-[9px] text-faint font-bold mb-0.5 uppercase tracking-wide">
                                          {isAssistant ? "Swaram" : "You"}
                                        </span>
                                        <div
                                          className={`bubble ${
                                            isAssistant ? "bubble-assistant" : "bubble-user"
                                          }`}
                                        >
                                          {msg.text}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            } catch {
                              return <p className="text-xs text-bad font-semibold">Failed to load chat history.</p>;
                            }
                          })()}
                        </div>
                      )}

                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: FormRecord["status"] }) {
  const map: Record<FormRecord["status"], [string, string]> = {
    processing: ["Processing", "bg-surface border border-line"],
    ready: ["Ready to fill", "bg-accent-soft text-accent"],
    filling: ["In progress", "bg-warn-soft text-warn"],
    review: ["In review", "bg-warn-soft text-[#d97706]"],
    complete: ["Complete", "bg-ok-soft text-ok"],
  };

  const [label, className] = map[status] || ["Draft", "bg-surface border border-line"];
  return <span className={`chip ${className} text-[10px] font-bold uppercase tracking-wider`}>{label}</span>;
}

function routeForForm(form: FormRecord): string {
  switch (form.status) {
    case "processing":
      return `/processing/${form.id}`;
    case "ready":
    case "filling":
      return `/fill/${form.id}`;
    case "review":
      return `/review/${form.id}`;
    case "complete":
      return `/complete/${form.id}`;
    default:
      return `/fill/${form.id}`;
  }
}
