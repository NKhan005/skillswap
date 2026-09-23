import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ArrowRightLeft, ArrowRight, Coins, Sparkles } from 'lucide-react';
import { Avatar, Chip, TrustBadge } from './ui';

/**
 * One person in the match feed. `match.theyTeachMe` / `match.iTeachThem` come
 * straight from the server's matching engine, so the card can explain exactly
 * why this person showed up.
 */
export default function MatchCard({ match, onRequest }) {
  const { user, matchType, theyTeachMe, iTeachThem, distanceKm, matchScore } = match;
  const [busy, setBusy] = useState(false);

  const mutual = matchType === 'mutual';

  const request = async (type) => {
    if (!onRequest) return;
    setBusy(true);
    try {
      await onRequest({
        providerId: user._id,
        skillRequested: theyTeachMe[0] || user.skillsOffered?.[0]?.name,
        skillOffered: iTeachThem[0] || null,
        type,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card animate-fade-up flex flex-col p-5 transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar name={user.name} src={user.avatarUrl} size={48} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/profile/${user._id}`} className="truncate font-semibold text-slate-900 hover:text-brand-600">
              {user.name}
            </Link>
            <TrustBadge score={user.trustScore ?? 0} size="sm" showLabel={false} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {user.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} />
                {user.city}
              </span>
            )}
            {distanceKm != null && <span>{distanceKm} km away</span>}
            <span className="inline-flex items-center gap-1">
              <Sparkles size={12} />
              {matchScore} match
            </span>
          </div>
        </div>

        {mutual && (
          <Chip tone="mint" className="shrink-0">
            <ArrowRightLeft size={12} />
            Mutual
          </Chip>
        )}
      </div>

      {user.bio && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{user.bio}</p>}

      <div className="mt-4 grid gap-3 text-sm">
        {theyTeachMe.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              They teach you
            </p>
            <div className="flex flex-wrap gap-1.5">
              {theyTeachMe.map((s) => (
                <Chip key={s} tone="brand" className="capitalize">
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {iTeachThem.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              You teach them
            </p>
            <div className="flex flex-wrap gap-1.5">
              {iTeachThem.map((s) => (
                <Chip key={s} tone="amber" className="capitalize">
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {theyTeachMe.length === 0 && iTeachThem.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(user.skillsOffered || []).slice(0, 4).map((s) => (
              <Chip key={s._id || s.name} tone="slate">
                {s.name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          disabled={busy || !onRequest}
          onClick={() => request(mutual ? 'direct' : 'credit')}
          className="btn-primary flex-1"
        >
          {mutual ? (
            <>
              <ArrowRightLeft size={15} />
              Propose swap
            </>
          ) : (
            <>
              <Coins size={15} />
              Use credits
            </>
          )}
        </button>

        <Link to={`/profile/${user._id}`} className="btn-secondary">
          View
          <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}
