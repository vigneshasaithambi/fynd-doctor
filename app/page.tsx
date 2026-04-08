"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Failed");
      }
      const { id } = await res.json();
      router.push(`/analyzing/${id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="px-8 py-6 flex items-center justify-between border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center font-bold">F</div>
          <div className="font-semibold">Fynd CRO Doctor</div>
        </div>
        <div className="text-sm text-zinc-400">MVP build</div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="max-w-2xl w-full text-center">
          <h1 className="text-5xl font-semibold tracking-tight mb-4">
            Diagnose your store&apos;s <span className="text-violet-400">conversion gaps</span> in 90 seconds.
          </h1>
          <p className="text-lg text-zinc-400 mb-10">
            Paste any e-commerce URL. We crawl Homepage → Category → PDP → Cart → Checkout, score it against Baymard, and tell you what to fix.
          </p>
          <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
            <label htmlFor="cro-url-input" className="sr-only">
              Website URL to analyze
            </label>
            <input
              id="cro-url-input"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.allbirds.com"
              aria-label="Website URL to analyze"
              className="flex-1 px-5 py-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
              required
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy}
              className="px-8 py-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 font-medium transition"
            >
              {busy ? "Starting…" : "Analyze My Website"}
            </button>
          </form>
          {err && <div className="mt-4 text-sm text-red-400">{err}</div>}
          <div className="mt-12 text-xs text-zinc-400">
            Crawls 5 funnel pages • Scores 6 categories • Uses Claude + PageSpeed
          </div>
        </div>
      </main>
    </div>
  );
}
