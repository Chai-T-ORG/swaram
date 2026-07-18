/**
 * intentMetrics.ts — Lightweight classification metrics.
 *
 * In-memory counters for observability. Logs to console in dev;
 * can be extended to export to analytics in prod. Zero network calls
 * by default — the caller decides when/whether to export.
 */

import type { ClassifiedIntent } from "./intentClassifier";

interface IntentMetrics {
  total: number;
  noiseFiltered: number;
  commandsLocal: number;
  answersLocal: number;
  offTopicLocal: number;
  llmFallback: number;
}

const metrics: IntentMetrics = {
  total: 0,
  noiseFiltered: 0,
  commandsLocal: 0,
  answersLocal: 0,
  offTopicLocal: 0,
  llmFallback: 0,
};

/**
 * Log a classification event. No-op in production if needed.
 */
export function logClassification(
  intent: ClassifiedIntent,
  source: "stt" | "fill" | "global",
): void {
  metrics.total++;

  switch (intent.type) {
    case "noise":
      metrics.noiseFiltered++;
      break;
    case "command":
      metrics.commandsLocal++;
      break;
    case "answer":
      metrics.answersLocal++;
      break;
    case "off_topic":
      metrics.offTopicLocal++;
      break;
    case "unknown":
      metrics.llmFallback++;
      break;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[IntentMetrics/${source}] ${intent.type}${intent.command ? `:${intent.command}` : ""}${intent.topic ? ` (${intent.topic})` : ""} conf=${intent.confidence.toFixed(2)} local=${intent.local}`,
    );
  }
}

/**
 * Get a snapshot of current metrics (for debugging / dashboards).
 */
export function getMetrics(): Readonly<IntentMetrics> {
  return { ...metrics };
}

/**
 * Reset all counters (useful for testing).
 */
export function resetMetrics(): void {
  metrics.total = 0;
  metrics.noiseFiltered = 0;
  metrics.commandsLocal = 0;
  metrics.answersLocal = 0;
  metrics.offTopicLocal = 0;
  metrics.llmFallback = 0;
}
