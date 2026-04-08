"use client";
import { useState } from "react";
import type { PageReport } from "@/lib/types";
import { IssueCard } from "./IssueCard";

const TAB_LABEL: Record<PageReport["pageType"], string> = {
  homepage: "Homepage",
  category: "Category",
  pdp: "Product",
  cart: "Cart",
  checkout: "Checkout",
};

export function PageTabs({ pages, reportId }: { pages: PageReport[]; reportId: string }) {
  const [active, setActive] = useState<PageReport["pageType"]>(pages[0]?.pageType ?? "homepage");
  const current = pages.find((p) => p.pageType === active);

  return (
    <div>
      <div className="flex gap-1 border-b border-zinc-800 mb-6 overflow-x-auto">
        {pages.map((p) => (
          <button
            key={p.pageType}
            onClick={() => setActive(p.pageType)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              active === p.pageType
                ? "border-violet-500 text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-300"
            }`}
          >
            {TAB_LABEL[p.pageType]}
            <span className="ml-2 text-xs text-zinc-400">({p.findings.length})</span>
          </button>
        ))}
      </div>
      {current && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-3">
            {current.findings.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-zinc-400 text-sm">
                {current.reached
                  ? "No issues found on this page — nice work."
                  : current.notes?.[0] || "Page could not be reached during the crawl."}
              </div>
            ) : (
              current.findings.map((f, i) => (
                <IssueCard key={f.id} finding={f} defaultOpen={i === 0} />
              ))
            )}
          </div>
          <div className="space-y-3">
            {current.screenshots.desktop && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Desktop</div>
                <img
                  src={`/api/screenshot/${reportId}/${current.screenshots.desktop}`}
                  alt="Desktop screenshot"
                  className="w-full rounded-lg border border-zinc-800"
                />
              </div>
            )}
            {current.screenshots.mobile && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Mobile</div>
                <img
                  src={`/api/screenshot/${reportId}/${current.screenshots.mobile}`}
                  alt="Mobile screenshot"
                  className="w-1/2 rounded-lg border border-zinc-800"
                />
              </div>
            )}
            {current.pageSpeed?.mobile && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-xs space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-400">PageSpeed</div>
                <div>Mobile perf: {current.pageSpeed.mobile.performance}</div>
                <div>Desktop perf: {current.pageSpeed.desktop?.performance}</div>
                <div>LCP (m): {current.pageSpeed.mobile.cwv.lcp.toFixed(2)}s</div>
                <div>CLS (m): {current.pageSpeed.mobile.cwv.cls.toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
