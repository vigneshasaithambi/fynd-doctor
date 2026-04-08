import type { CategoryScore } from "@/lib/types";

export function CategoryBars({ items }: { items: CategoryScore[] }) {
  return (
    <div className="space-y-3 w-full">
      {items.map((c) => {
        const color = c.score >= 80 ? "bg-green-500" : c.score >= 60 ? "bg-yellow-500" : "bg-red-500";
        return (
          <div key={c.key}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-zinc-300">{c.label}</span>
              <span className="text-zinc-400 tabular-nums">{c.score}/100</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className={`h-full ${color}`} style={{ width: `${c.score}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
