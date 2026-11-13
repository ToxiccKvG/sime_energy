

// ─── BREADCRUMB ──────────────────────────────────────────────────────────────

export function Breadcrumb({ parts }: { parts: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-700">/</span>}
          <span className={p.color}>{p.label}</span>
        </span>
      ))}
    </div>
  );
}
