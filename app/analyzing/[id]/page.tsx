"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  "Loading homepage",
  "Crawling category pages",
  "Inspecting product pages",
  "Walking through cart",
  "Analyzing checkout flow",
  "Running PageSpeed audits",
  "Capturing screenshots",
  "Running Claude analysis",
  "Generating report",
];

export default function Analyzing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [phase, setPhase] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Polling with exponential backoff + max retries (scale plan Step 8).
  // Pre-fix: fixed 1.5s interval, errors swallowed, no max retries → loader
  // could spin forever if the server died or the file was missing.
  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;
    const BACKOFFS = [1500, 1500, 3000, 6000, 12000];
    const MAX_FAILURES = 5;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timeout = setTimeout(tick, delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/status/${id}`);
        if (!res.ok) {
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_FAILURES) {
            setError(
              `Lost contact with the server (HTTP ${res.status}). Try refreshing the page.`,
            );
            return;
          }
          schedule(BACKOFFS[Math.min(consecutiveFailures, BACKOFFS.length - 1)]);
          return;
        }
        const s = await res.json();
        if (cancelled) return;
        consecutiveFailures = 0;
        setPhase(s.phase);
        if (s.error) {
          setError(s.error);
          // Stuck-crawl detection from Step 5 returns done:true with an error.
          // Don't auto-redirect; let the user see the error.
          if (s.done) return;
        }
        if (s.done) {
          setDone(true);
          setTimeout(() => router.push(`/report/${id}`), 600);
          return;
        }
        schedule(BACKOFFS[0]);
      } catch (e) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_FAILURES) {
          setError(`Polling failed: ${(e as Error).message}`);
          return;
        }
        schedule(BACKOFFS[Math.min(consecutiveFailures, BACKOFFS.length - 1)]);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [id, router]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-8">
      <div className="max-w-xl w-full">
        <div className="mb-8 text-center">
          <div className="inline-block w-10 h-10 rounded-full border-4 border-violet-600 border-t-transparent animate-spin mb-4" />
          <h2 className="text-2xl font-semibold">
            {phase === -1 ? "Waiting in queue…" : "Analyzing your store…"}
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            {phase === -1
              ? "Another crawl is running. We'll start as soon as a slot frees up."
              : "This usually takes 60–90 seconds."}
          </p>
        </div>
        <ul className="space-y-3">
          {STEPS.map((s, i) => {
            const state =
              phase === -1
                ? "pending"
                : i < phase || done
                  ? "done"
                  : i === phase
                    ? "active"
                    : "pending";
            return (
              <li
                key={s}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition ${
                  state === "done"
                    ? "border-violet-700 bg-violet-950/30 text-zinc-100"
                    : state === "active"
                      ? "border-violet-500 bg-violet-900/20 text-zinc-100"
                      : "border-zinc-800 bg-zinc-900/30 text-zinc-400"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    state === "done"
                      ? "bg-violet-600 text-white"
                      : state === "active"
                        ? "bg-violet-600 text-white animate-pulse"
                        : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {state === "done" ? "✓" : i + 1}
                </div>
                {s}
              </li>
            );
          })}
        </ul>
        {error && (
          <div className="mt-6 p-4 rounded-lg border border-red-900 bg-red-950/40 text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
