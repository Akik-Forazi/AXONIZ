"use client";

/**
 * Benchmarks route - renders the honest benchmark page (single source of truth).
 *
 * History: this route used to inline a fabricated "PEAK" comparison table
 * (static numbers presented as measured data, with an invented methodology
 * footnote). That violated the project's own honesty contract. The real
 * implementation lives in components/axoniz/pages/benchmarks.tsx, which shows
 * "No benchmarks run yet" until `axoniz test` produces real, hardware-tagged
 * results. No fabricated values, ever.
 */
export { BenchmarksPage as default } from "@/components/axoniz/pages/benchmarks";
