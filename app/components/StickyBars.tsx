"use client";

export function StickyTop({ url, reportId }: { url: string; reportId: string }) {
  return (
    <div className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-zinc-900 print:hidden">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-violet-600 flex items-center justify-center text-xs font-bold">F</div>
          <div className="text-sm text-zinc-400 truncate">{url}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className="px-3 py-1.5 text-xs rounded-md border border-zinc-800 hover:border-zinc-700"
          >
            Share
          </button>
          <a
            href={`/api/pdf/${reportId}`}
            className="px-3 py-1.5 text-xs rounded-md bg-violet-600 hover:bg-violet-500 font-medium"
          >
            Download PDF
          </a>
        </div>
      </div>
    </div>
  );
}

export function StickyBottom() {
  return (
    <div className="sticky bottom-0 z-20 bg-violet-950/80 backdrop-blur border-t border-violet-900 print:hidden">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <div className="text-sm text-violet-100">
          Want Fynd to fix the platform-limited issues for you?
        </div>
        <a
          href="https://www.fynd.com"
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 text-sm rounded-md bg-white text-violet-900 font-medium hover:bg-violet-100"
        >
          Talk to Fynd
        </a>
      </div>
    </div>
  );
}
