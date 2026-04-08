import { notFound } from "next/navigation";
import { readReport } from "@/lib/utils/storage";
import { ScoreRing } from "@/app/components/ScoreRing";
import { CategoryBars } from "@/app/components/CategoryBars";
import { CheckoutScorecard } from "@/app/components/CheckoutScorecard";
import { PageTabs } from "@/app/components/PageTabs";
import { BucketSummary } from "@/app/components/BucketSummary";
import { StickyTop, StickyBottom } from "@/app/components/StickyBars";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const report = await readReport(id);
  if (!report) notFound();

  const isPrint = sp.print === "1";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {!isPrint && <StickyTop url={report.url} reportId={id} />}

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-12">
        {/* Section A — Score */}
        <section className="grid lg:grid-cols-[auto_1fr] gap-10 items-center">
          <ScoreRing score={report.overallScore} />
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-400">CRO Audit</div>
              <h1 className="text-3xl font-semibold">{report.domain}</h1>
              <p className="text-zinc-400 mt-2 max-w-2xl">{report.execSummary}</p>
            </div>
            <CategoryBars items={report.categoryScores} />
          </div>
        </section>

        {/* Section B — Stat cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Total issues" value={report.stats.totalIssues} />
          <Stat label="Critical" value={report.stats.criticalIssues} accent="text-red-400" />
          <Stat label="Fix Now" value={report.stats.bucket1Count} accent="text-green-400" />
          <Stat label="Platform Limited" value={report.stats.bucket2Count} accent="text-violet-400" />
        </section>

        {/* Section C — Checkout scorecard */}
        {report.checkoutScorecard && (
          <section>
            <CheckoutScorecard data={report.checkoutScorecard} />
          </section>
        )}

        {/* Section D — Page-by-page issues */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Page-by-page findings</h2>
          <PageTabs pages={report.pages} reportId={id} />
        </section>

        {/* Section E — Bucket summary */}
        <section>
          <h2 className="text-xl font-semibold mb-4">What to fix vs. where to upgrade</h2>
          <BucketSummary data={report.bucketSummary} />
        </section>

        {/* Section F — CTA */}
        <section className="rounded-2xl border border-violet-800 bg-gradient-to-br from-violet-950/60 to-zinc-950 p-8 text-center">
          <h2 className="text-2xl font-semibold mb-2">Ready to capture the lost conversions?</h2>
          <p className="text-zinc-400 mb-5 max-w-xl mx-auto">
            Fynd&apos;s commerce platform ships sticky ATC, native wallets, guest checkout, and edge-cached
            storefronts out of the box. Talk to us about migrating.
          </p>
          <a
            href="https://www.fynd.com"
            target="_blank"
            rel="noreferrer"
            className="inline-block px-6 py-3 rounded-lg bg-violet-600 hover:bg-violet-500 font-medium"
          >
            Book a demo
          </a>
        </section>
      </main>

      {!isPrint && <StickyBottom />}
    </div>
  );
}

function Stat({ label, value, accent = "text-zinc-100" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className={`text-3xl font-semibold ${accent}`}>{value}</div>
      <div className="text-xs uppercase tracking-wider text-zinc-400 mt-1">{label}</div>
    </div>
  );
}
