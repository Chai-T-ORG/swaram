"use client";

/**
 * Preview, desktop (spec §3 & §0) — 2-column layout with document overlay pane
 * on the left and field inspection/editing list on the right.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { usePreview } from "@/components/screens/usePreview";
import type { FieldType, FormField } from "@/lib/types";
import {
  IconPlay,
  IconWave,
  IconPause,
  IconTrash,
  IconEdit,
  IconCheck,
  IconAlertCircle,
  IconSparkle,
  IconRepeat,
} from "@/components/icons";

function PdfPageCanvas({
  pageIndex,
  renderPdfPage,
}: {
  pageIndex: number;
  renderPdfPage: (index: number) => Promise<HTMLCanvasElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    renderPdfPage(pageIndex).then((canvas) => {
      if (!active || !canvas || !containerRef.current) return;
      containerRef.current.innerHTML = "";
      const clone = canvas.cloneNode(true) as HTMLCanvasElement;
      const ctx = clone.getContext("2d");
      if (ctx) {
        ctx.drawImage(canvas, 0, 0);
      }
      clone.className = "w-full h-auto block rounded border border-line shadow-sm bg-white";
      containerRef.current.appendChild(clone);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [pageIndex, renderPdfPage]);

  return (
    <div ref={containerRef} className="relative w-full">
      {loading && (
        <div className="flex h-64 w-full items-center justify-center rounded border border-line bg-sunken">
          <div className="skeleton-text h-6 w-32 rounded" />
        </div>
      )}
    </div>
  );
}

export default function PreviewDesktop() {
  const pv = usePreview();
  const prefersReducedMotion = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);

  if (!pv.record) {
    return (
      <div className="mx-auto flex w-full max-w-6xl gap-8 pt-2">
        <div className="w-[55%] shrink-0">
          <div className="skeleton-card h-[600px]" />
        </div>
        <div className="flex flex-1 flex-col gap-4">
          <div className="skeleton-text h-6 w-32 rounded" />
          <div className="skeleton-text h-10 w-64 rounded" />
          <div className="skeleton-card h-24" />
          <div className="skeleton-card h-24" />
        </div>
      </div>
    );
  }

  const pageCount = pv.record.pageCount || 1;
  const EDITABLE_TYPES: FieldType[] = ["text", "date", "choice", "checkbox"];

  return (
    <div className="mx-auto flex w-full max-w-6xl items-start gap-8 animate-fade-in pb-12">
      {/* Sticky Document Pane (Left Column ~55%) */}
      <div className="sticky top-4 w-[55%] shrink-0 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-line bg-sunken/40 p-4 shadow-sm">
        <div className="flex flex-col gap-6">
          {Array.from({ length: pageCount }).map((_, pageIdx) => {
            const pageFields = pv.sortedFields.filter((f) => f.page === pageIdx && f.bbox !== null);

            return (
              <div key={pageIdx} className="relative w-full overflow-hidden rounded border border-line/60 bg-surface">
                {pv.record?.sourceType === "pdf" ? (
                  <PdfPageCanvas pageIndex={pageIdx} renderPdfPage={pv.renderPdfPage} />
                ) : (
                  pv.originalUrl && (
                    <img
                      src={pv.originalUrl}
                      alt={`Page ${pageIdx + 1}`}
                      className="w-full h-auto block rounded"
                    />
                  )
                )}

                {/* Field Overlay Boxes (skip fields with bbox === null) */}
                <div className="absolute inset-0 pointer-events-none">
                  {pageFields.map((field) => {
                    if (!field.bbox) return null;
                    const isSelected = pv.selectedFieldId === field.id;
                    const isUnclear = field.confidence < 60 && field.source === "ocr";

                    return (
                      <button
                        key={field.id}
                        type="button"
                        onClick={() => pv.selectField(field.id)}
                        style={{
                          left: `${field.bbox.x * 100}%`,
                          top: `${field.bbox.y * 100}%`,
                          width: `${field.bbox.w * 100}%`,
                          height: `${field.bbox.h * 100}%`,
                        }}
                        aria-label={`Field ${field.label}`}
                        className={`absolute pointer-events-auto transition-all duration-200 focus:outline-none ${
                          isSelected
                            ? "border-2 border-accent bg-accent/20 shadow-md ring-2 ring-accent/30 z-10"
                            : isUnclear
                              ? "border-1.5 border-warn bg-warn/10 hover:bg-warn/20"
                              : "border-1.5 border-accent/60 hover:border-accent hover:bg-accent/10"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Field Inspection List (Right Column) */}
      <div className="flex flex-1 flex-col gap-6">
        <header className="border-b border-line pb-4">
          <span className="eyebrow">Before you fill</span>
          <h1 className="mt-1 font-display text-3xl text-ink">Check what I found</h1>
          <p className="mt-1 text-sm text-soft">
            <strong className="font-semibold text-ink">{pv.counts.total} fields</strong> · fix anything I got wrong, then start.
          </p>
        </header>

        <StatusAnnouncer message={pv.status} tone={pv.tone} />

        {/* Undo Banner */}
        {pv.undoState && (
          <div className="flex items-center justify-between rounded-xl border border-line bg-sunken px-4 py-3 text-sm">
            <span className="text-soft">
              Removed <strong className="text-ink">{pv.undoState.field.label}</strong>
            </span>
            <button
              type="button"
              onClick={pv.undoRemove}
              className="btn-secondary min-h-9 px-3 text-xs font-semibold"
            >
              <IconRepeat className="h-3.5 w-3.5" />
              Undo
            </button>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button type="button" className="btn-primary min-h-12 px-6 text-sm" onClick={pv.goFill}>
            <IconPlay className="h-4 w-4 fill-current" />
            Start filling
          </button>

          <button type="button" className="btn-secondary min-h-12 px-4 text-sm" onClick={pv.readFields}>
            {pv.reading ? <IconPause className="h-4 w-4" /> : <IconWave className="h-4 w-4" />}
            {pv.reading ? "Stop reading" : "Read fields aloud"}
          </button>
        </div>

        {/* Field List */}
        <ul ref={listRef} className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Detected fields list">
          {pv.sortedFields.map((field, index) => {
            const isSelected = pv.selectedFieldId === field.id;
            const isEditing = pv.editingId === field.id;
            const isUnclear = field.confidence < 60 && field.source === "ocr";
            const isAutofill = Boolean(field.profileKey && !field.sensitive);

            return (
              <motion.li
                key={field.id}
                layout
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => pv.selectField(field.id)}
                className={`card p-4 transition-all cursor-pointer ${
                  isSelected ? "ring-2 ring-accent border-accent/40 bg-surface shadow-md" : "hover:border-line/80"
                }`}
              >
                {isEditing ? (
                  <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-faint">{index + 1}.</span>
                      <input
                        type="text"
                        value={pv.editLabel}
                        onChange={(e) => pv.setEditLabel(e.target.value)}
                        className="input-field flex-1 text-sm font-semibold"
                        placeholder="Field label"
                        autoFocus
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-line/50">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-soft">Type:</label>
                        {EDITABLE_TYPES.includes(field.type) ? (
                          <select
                            value={pv.editType}
                            onChange={(e) => pv.setEditType(e.target.value as FieldType)}
                            className="input-field text-xs py-1 px-2"
                          >
                            <option value="text">text</option>
                            <option value="date">date</option>
                            <option value="choice">choice</option>
                            <option value="checkbox">checkbox</option>
                          </select>
                        ) : (
                          <span className="chip text-[11px] font-medium bg-sunken text-soft">
                            {field.type} (read-only)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn-secondary min-h-9 px-3 text-xs"
                          onClick={pv.cancelEdit}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-primary min-h-9 px-4 text-xs"
                          onClick={() => pv.saveEdit(field.id)}
                        >
                          <IconCheck className="h-3.5 w-3.5" />
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs font-bold uppercase text-faint">{index + 1}.</span>
                        <h2 className="text-base font-semibold leading-snug text-ink truncate">
                          {field.label}
                        </h2>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-secondary min-h-9 px-2.5 text-xs"
                          onClick={() => pv.startEdit(field)}
                          aria-label={`Rename ${field.label}`}
                        >
                          <IconEdit className="h-3.5 w-3.5" />
                          Rename
                        </button>
                        <button
                          type="button"
                          className="btn-secondary min-h-9 px-2.5 text-xs text-warn hover:bg-warn-soft/40"
                          onClick={() => pv.removeField(field)}
                          aria-label={`Remove field ${field.label}`}
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Chips & Spoken Question */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip bg-sunken text-[11px] font-semibold text-soft">
                        {field.type}
                      </span>
                      {isAutofill && (
                        <span className="chip bg-accent-soft text-[11px] font-bold text-accent">
                          <IconSparkle className="h-3 w-3" aria-hidden="true" />
                          auto-fill
                        </span>
                      )}
                      {isUnclear && (
                        <span className="chip bg-warn-soft text-[11px] font-bold text-warn">
                          <IconAlertCircle className="h-3 w-3" aria-hidden="true" />
                          unclear
                        </span>
                      )}
                    </div>

                    {field.question && (
                      <p className="text-xs text-soft leading-relaxed italic">
                        &ldquo;{field.question}&rdquo;
                      </p>
                    )}
                  </div>
                )}
              </motion.li>
            );
          })}
        </ul>

        {/* Quiet Home Link */}
        <div className="border-t border-line/60 pt-4">
          <Link href="/" className="link-plain text-sm font-semibold">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
