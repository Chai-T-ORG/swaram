"use client";

/**
 * Preview, mobile (spec §3 & §0) — collapsible top document card with box overlays,
 * scrollable field list beneath, and a sticky Start filling bar above the orb dock.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { usePreview } from "@/components/screens/usePreview";
import type { FieldType } from "@/lib/types";
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
  IconChevronDown,
} from "@/components/icons";

function PdfPageCanvas({
  pageIndex,
  renderPdfPage,
}: {
  pageIndex: number;
  renderPdfPage: (index: number) => Promise<HTMLCanvasElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    renderPdfPage(pageIndex).then((source) => {
      const target = canvasRef.current;
      if (!active || !source || !target) return;
      target.width = source.width;
      target.height = source.height;
      target.getContext("2d")?.drawImage(source, 0, 0);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [pageIndex, renderPdfPage]);

  return (
    <div className="relative w-full">
      {loading && (
        <div className="flex h-48 w-full items-center justify-center rounded border border-line bg-sunken">
          <div className="skeleton-text h-5 w-24 rounded" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`w-full h-auto block rounded border border-line shadow-sm bg-white ${loading ? "hidden" : ""}`}
      />
    </div>
  );
}

export default function PreviewMobile() {
  const pv = usePreview();
  const prefersReducedMotion = useReducedMotion();
  const [docCollapsed, setDocCollapsed] = useState(false);

  if (!pv.record) {
    return (
      <div className="flex flex-col gap-4 pb-24">
        <header>
          <div className="skeleton-text h-4 w-24 rounded" />
          <div className="skeleton-text mt-2 h-8 w-48 rounded" />
        </header>
        <div className="skeleton-card h-48" />
        <div className="skeleton-card h-24" />
        <div className="skeleton-card h-24" />
      </div>
    );
  }

  const pageCount = pv.record.pageCount || 1;
  const EDITABLE_TYPES: FieldType[] = ["text", "date", "choice", "checkbox"];
  const pageFields = pv.sortedFields.filter(
    (f) => f.page === pv.currentPage && f.bbox !== null,
  );

  return (
    <div className="flex flex-col gap-5 pb-28 animate-fade-in w-full">
      <header>
        <span className="eyebrow">Before you fill</span>
        <h1 className="mt-1 font-display text-[1.75rem] leading-tight text-ink">Check what I found</h1>
        <p className="mt-1 text-sm text-soft">
          <strong className="font-semibold text-ink">{pv.counts.total} fields</strong> · fix anything I got wrong, then start.
        </p>
      </header>

      <StatusAnnouncer message={pv.status} tone={pv.tone} />

      {/* Collapsible Document Card */}
      <div className="card overflow-hidden p-0">
        <button
          type="button"
          onClick={() => setDocCollapsed(!docCollapsed)}
          className="flex w-full items-center justify-between border-b border-line/50 bg-sunken/40 px-4 py-2.5 text-xs font-semibold text-soft hover:text-ink"
        >
          <span>
            Document preview {pageCount > 1 ? `(Page ${pv.currentPage + 1} of ${pageCount})` : ""}
          </span>
          <span className="flex items-center gap-1">
            {docCollapsed ? "Expand" : "Collapse"}
            <IconChevronDown className={`h-4 w-4 transition-transform ${docCollapsed ? "" : "rotate-180"}`} />
          </span>
        </button>

        {!docCollapsed && (
          <div className="relative p-3 bg-sunken/20">
            {/* Page Switcher for Multi-page */}
            {pageCount > 1 && (
              <div className="mb-2 flex items-center justify-center gap-1.5" aria-label="Page selection">
                {Array.from({ length: pageCount }).map((_, pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => pv.setCurrentPage(pIdx)}
                    className={`h-2.5 rounded-full transition-all ${
                      pv.currentPage === pIdx ? "w-6 bg-accent" : "w-2.5 bg-line hover:bg-soft"
                    }`}
                    aria-label={`Go to page ${pIdx + 1}`}
                  />
                ))}
              </div>
            )}

            <div className="relative max-h-[40vh] overflow-y-auto rounded border border-line/60 bg-surface">
              {pv.record.sourceType === "pdf" ? (
                <PdfPageCanvas pageIndex={pv.currentPage} renderPdfPage={pv.renderPdfPage} />
              ) : (
                pv.originalUrl && (
                  <img
                    src={pv.originalUrl}
                    alt={`Page ${pv.currentPage + 1}`}
                    className="w-full h-auto block rounded"
                  />
                )
              )}

              {/* Bounding box overlays (skip bbox === null) */}
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
                          ? "border-2 border-accent bg-accent/20 ring-2 ring-accent/30 z-10"
                          : isUnclear
                            ? "border-1.5 border-warn bg-warn/10"
                            : "border-1.5 border-accent/60"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Undo Banner */}
      {pv.undoState && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-sunken px-4 py-2.5 text-xs">
          <span className="text-soft">
            Removed <strong className="text-ink">{pv.undoState.field.label}</strong>
          </span>
          <button
            type="button"
            onClick={pv.undoRemove}
            className="btn-secondary min-h-8 px-2.5 text-xs font-semibold"
          >
            <IconRepeat className="h-3 w-3" />
            Undo
          </button>
        </div>
      )}

      {/* Secondary voice read-back action */}
      <div className="flex justify-end">
        <button
          type="button"
          className="btn-secondary min-h-10 px-3.5 text-xs"
          onClick={pv.readFields}
        >
          {pv.reading ? <IconPause className="h-3.5 w-3.5" /> : <IconWave className="h-3.5 w-3.5" />}
          {pv.reading ? "Stop reading" : "Read fields aloud"}
        </button>
      </div>

      {/* Field Inspection List */}
      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Detected fields list">
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
                isSelected ? "ring-2 ring-accent border-accent/40 bg-surface shadow-sm" : ""
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

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/50">
                    <div className="flex items-center gap-1.5">
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
                        <span className="chip text-[10px] font-medium bg-sunken text-soft">
                          {field.type}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="btn-secondary min-h-8 px-2.5 text-xs"
                        onClick={pv.cancelEdit}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-primary min-h-8 px-3 text-xs"
                        onClick={() => pv.saveEdit(field.id)}
                      >
                        <IconCheck className="h-3 w-3" />
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-bold uppercase text-faint">{index + 1}.</span>
                      <h2 className="text-sm font-semibold leading-snug text-ink truncate">
                        {field.label}
                      </h2>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn-secondary min-h-8 px-2 text-xs"
                        onClick={() => pv.startEdit(field)}
                        aria-label={`Rename ${field.label}`}
                      >
                        <IconEdit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn-secondary min-h-8 px-2 text-xs text-warn hover:bg-warn-soft/40"
                        onClick={() => pv.removeField(field)}
                        aria-label={`Remove field ${field.label}`}
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Chips & Spoken Question */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="chip bg-sunken text-[10px] font-semibold text-soft">
                      {field.type}
                    </span>
                    {isAutofill && (
                      <span className="chip bg-accent-soft text-[10px] font-bold text-accent">
                        <IconSparkle className="h-3 w-3" aria-hidden="true" />
                        auto-fill
                      </span>
                    )}
                    {isUnclear && (
                      <span className="chip bg-warn-soft text-[10px] font-bold text-warn">
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

      {/* Home link */}
      <div className="pt-2">
        <Link href="/" className="link-plain text-xs font-semibold">
          Back to home
        </Link>
      </div>

      {/* Sticky Bottom Action Bar above dock */}
      <div className="sticky bottom-2 z-20 -mx-1 rounded-full bg-surface/60 p-1 backdrop-blur">
        <button
          type="button"
          className="btn-primary min-h-14 w-full shadow-float"
          onClick={pv.goFill}
        >
          <IconPlay className="h-4 w-4 fill-current" />
          Start filling
        </button>
      </div>
    </div>
  );
}
