import { Link } from 'react-router-dom';
import { Trophy, TrendingUp, Coins, ShieldCheck, Repeat, Inbox } from 'lucide-react';
import { Avatar, Chip, StatTile, TrustBadge } from './ui';

/**
 * The dashboard's side column. Each panel is small and independent; keeping
 * them here rather than inline leaves the page itself readable as a layout.
 */

/** The four headline numbers across the top of the dashboard. */
export function StatsRow({ user, counts }) {
  const wallet = user.wallet || {};
  const stats = user.trustStats || {};

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        icon={Coins}
        tone="mint"
        label="Time credits"
        value={wallet.balance ?? 0}
        hint={`${wallet.totalEarned ?? 0} earned / ${wallet.totalSpent ?? 0} spent`}
      />
      <StatTile
        icon={ShieldCheck}
        tone="brand"
        label="Trust score"
        value={`${user.trustScore ?? 0}/100`}
        hint={`${stats.totalReviews ?? 0} reviews`}
      />
      <StatTile
        icon={Repeat}
        tone="sky"
        label="Completed swaps"
        value={counts.completed}
        hint={`${counts.active} in progress`}
      />
      <StatTile
        icon={Inbox}
        tone="amber"
        label="Incoming requests"
        value={counts.incoming}
        hint={counts.incoming ? 'Respond to keep your rate up' : 'All caught up'}
      />
    </div>
  );
}

/** Feature 4 - the three inputs behind the trust score, and the score itself. */
export function TrustPanel({ user }) {
  const s = user.trustStats || {};
  const responded = s.requestsResponded ?? 0;
  const received = s.requestsReceived ?? 0;

  const rows = [
    ['Reviews', s.totalReviews ?? 0, `avg ${s.averageRating ?? 0}`],
    ['Completed swaps', s.completedSwaps ?? 0, ''],
    ['Response rate', `${Math.round((s.responseRate ?? 0) * 100)}%`, `${responded}/${received}`],
  ];

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Trust score</h2>
        <TrustBadge score={user.trustScore ?? 0} size="sm" />
      </div>

      <div className="grid gap-2.5 text-sm">
        {rows.map(([label, value, hint]) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-slate-600">{label}</span>
            <span className="font-medium text-slate-900">
              {value} {hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${user.trustScore ?? 0}%` }}
        />
      </div>
    </section>
  );
}

/** Pending requests where this member is the provider. */
export function IncomingRequests({ swaps }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 font-semibold text-slate-900">Requests for you</h2>

      {swaps.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">Nothing waiting.</p>
      ) : (
        <ul className="grid gap-3">
          {swaps.slice(0, 4).map((s) => (
            <li key={s._id} className="flex items-center gap-3">
              <Avatar name={s.requester.name} src={s.requester.avatarUrl} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{s.requester.name}</p>
                <p className="truncate text-xs text-slate-500">wants {s.skillRequested}</p>
              </div>
              <Link to="/swaps" className="btn-secondary px-2.5 py-1.5 text-xs">
                Review
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Challenges this member has joined but not yet finished. */
export function ChallengeProgress({ challenges }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Challenges</h2>
        <Link to="/challenges" className="text-sm font-medium text-brand-600 hover:underline">
          All
        </Link>
      </div>

      {challenges.length === 0 ? (
        <div className="py-3 text-center">
          <Trophy size={20} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Join one to earn bonus credits.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {challenges.slice(0, 3).map((c) => (
            <li key={c._id}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{c.title}</span>
                <Chip tone="mint">+{c.rewardCredits}</Chip>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.percent}%` }} />
                </div>
                <span className="text-xs text-slate-400">
                  {c.progress}/{c.target}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The most recent completed swaps, named by the other party. */
export function RecentActivity({ swaps, viewerId }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
        <TrendingUp size={16} className="text-slate-400" />
        Recent activity
      </h2>

      {swaps.length === 0 ? (
        <p className="py-3 text-center text-sm text-slate-400">No completed swaps yet.</p>
      ) : (
        <ul className="grid gap-2.5 text-sm">
          {swaps.slice(0, 4).map((s) => {
            const other = s.requester._id === viewerId ? s.provider : s.requester;
            return (
              <li key={s._id} className="flex items-center gap-2 text-slate-600">
                <Avatar name={other.name} src={other.avatarUrl} size={26} />
                <span className="truncate">
                  {s.skillRequested} with <span className="font-medium text-slate-800">{other.name}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
