export function ScoreRing({ score }: { score: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";
  return (
    <div className="relative w-44 h-44">
      <svg viewBox="0 0 160 160" className="-rotate-90 w-full h-full">
        <circle cx="80" cy="80" r={r} stroke="#27272a" strokeWidth="14" fill="none" />
        <circle
          cx="80"
          cy="80"
          r={r}
          stroke={color}
          strokeWidth="14"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-semibold text-zinc-100">{score}</div>
        <div className="text-xs uppercase tracking-wider text-zinc-400">CRO Score</div>
      </div>
    </div>
  );
}
