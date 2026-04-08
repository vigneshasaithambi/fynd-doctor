"use client";
import { useState } from "react";
import type { Finding } from "@/lib/types";

const SEV_COLOR: Record<Finding["severity"], string> = {
  critical: "bg-red-950/40 border-red-900 text-red-300",
  high: "bg-red-950/30 border-red-900/70 text-red-300",
  medium: "bg-yellow-950/30 border-yellow-900/70 text-yellow-300",
  low: "bg-blue-950/30 border-blue-900/70 text-blue-300",
};

export function IssueCard({ finding, defaultOpen = false }: { finding: Finding; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left px-5 py-4 flex items-start justify-between gap-4 hover:bg-zinc-900/70 transition"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${SEV_COLOR[finding.severity]}`}>
              {finding.severity}
            </span>
            <span
              className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${
                finding.bucket === "fix-now"
                  ? "border-green-800 bg-green-950/40 text-green-300"
                  : "border-violet-800 bg-violet-950/40 text-violet-300"
              }`}
            >
              {finding.bucket === "fix-now" ? "Fix Now" : "Platform Limited"}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-400">{finding.category}</span>
          </div>
          <div className="font-medium text-zinc-100">{finding.title}</div>
        </div>
        <div className="text-zinc-400 text-xl leading-none">{open ? "−" : "+"}</div>
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-zinc-300 space-y-3">
          <p>{finding.description}</p>
          {finding.evidence && (
            <div className="text-xs text-zinc-400 italic">Evidence: {finding.evidence}</div>
          )}
          <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 p-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Recommendation</div>
            <div>{finding.recommendation}</div>
          </div>
          {finding.fyndAdvantage && (
            <div className="rounded-lg bg-violet-950/30 border border-violet-900 p-3">
              <div className="text-[10px] uppercase tracking-wider text-violet-300 mb-1">Fynd Advantage</div>
              <div className="text-violet-100">{finding.fyndAdvantage}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
