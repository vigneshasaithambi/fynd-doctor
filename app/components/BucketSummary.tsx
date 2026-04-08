import type { BucketSummary as B } from "@/lib/types";

export function BucketSummary({ data }: { data: B }) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Column
        title="Bucket 1 — Fix Now"
        subtitle="Quick wins on your current platform"
        accent="border-green-800 bg-green-950/20"
        chip="bg-green-950/60 text-green-300 border-green-800"
        items={data.fixNow}
      />
      <Column
        title="Bucket 2 — Platform Limited"
        subtitle="Where Fynd unlocks step-change improvements"
        accent="border-violet-800 bg-violet-950/20"
        chip="bg-violet-950/60 text-violet-300 border-violet-800"
        items={data.platformLimited}
      />
    </div>
  );
}

function Column({
  title,
  subtitle,
  accent,
  chip,
  items,
}: {
  title: string;
  subtitle: string;
  accent: string;
  chip: string;
  items: B["fixNow"];
}) {
  return (
    <div className={`rounded-2xl border p-6 ${accent}`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-xs text-zinc-400">{subtitle}</p>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-zinc-400">No issues in this bucket.</div>
        ) : (
          items.slice(0, 8).map((f) => (
            <div key={f.id} className="flex items-start gap-2">
              <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border mt-0.5 ${chip}`}>{f.severity}</span>
              <span className="text-sm text-zinc-200">{f.title}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
