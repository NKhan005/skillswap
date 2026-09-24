import { Star, ShieldCheck, Loader2, Inbox } from 'lucide-react';

/** Small labelled pill. `tone` maps to a fixed palette so colours stay consistent. */
export function Chip({ children, tone = 'slate', className = '' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    brand: 'bg-brand-100 text-brand-700',
    mint: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-800',
    rose: 'bg-rose-100 text-rose-700',
    sky: 'bg-sky-100 text-sky-700',
  };
  return <span className={`chip ${tones[tone] || tones.slate} ${className}`}>{children}</span>;
}

/** Initials avatar - no image hosting needed for the demo data. */
export function Avatar({ name = '?', src, size = 40, className = '' }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // A span, not a div: avatars sit inside <p> in a few places, and a block
  // element there is invalid HTML that React flags as a hydration error.
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-white ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  );
}

/**
 * Trust bands, highest first: the first threshold a score clears wins.
 * A table rather than a ternary ladder, so the bands stay readable and the
 * boundaries are visible at a glance.
 */
const TRUST_BANDS = [
  { min: 80, tone: 'bg-emerald-100 text-emerald-700', label: 'Trusted' },
  { min: 50, tone: 'bg-sky-100 text-sky-700', label: 'Established' },
  { min: 1, tone: 'bg-amber-100 text-amber-800', label: 'Building' },
  { min: 0, tone: 'bg-slate-100 text-slate-600', label: 'New' },
];

/** Trust score badge - colour tracks the band, not just the number. */
export function TrustBadge({ score = 0, size = 'md', showLabel = true }) {
  const band = TRUST_BANDS.find((b) => score >= b.min) ?? TRUST_BANDS.at(-1);

  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${band.tone} ${pad}`}
      title={`Trust score ${score} of 100 - ${band.label}`}
    >
      <ShieldCheck size={size === 'sm' ? 12 : 14} />
      {score}
      {showLabel && <span className="font-medium opacity-75">/100</span>}
    </span>
  );
}

export function Stars({ rating = 0, size = 14, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
        />
      ))}
    </span>
  );
}

export function Spinner({ label = 'Loading', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-slate-500 ${className}`}>
      <Loader2 className="animate-spin" size={18} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-400">
        <Icon size={24} />
      </div>
      <div>
        <p className="font-semibold text-slate-700">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
      {children}
    </p>
  );
}

/** Headline number used across the dashboard and wallet. */
export function StatTile({ icon: Icon, label, value, hint, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    mint: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600',
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        {Icon && (
          <span className={`rounded-xl p-2.5 ${tones[tone] || tones.brand}`}>
            <Icon size={20} />
          </span>
        )}
      </div>
    </div>
  );
}
