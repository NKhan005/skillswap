import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Coins,
  ShieldCheck,
  Repeat,
  Sparkles,
  ArrowRight,
  Inbox,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { endpoints } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Avatar, Chip, EmptyState, Spinner, StatTile, TrustBadge } from '../components/ui';
import MatchCard from '../components/MatchCard';
import SwapRequestModal from '../components/SwapRequestModal';

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const { notify } = useNotifications();

  const [matches, setMatches] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalTarget, setModalTarget] = useState(null);
  const [prefill, setPrefill] = useState({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // One round of fetches; a failure in any one should not blank the page.
        const [m, s, c] = await Promise.allSettled([
          endpoints.matching.direct({ limit: 6 }),
          endpoints.swaps.list(),
          endpoints.challenges.list(),
        ]);
        if (cancelled) return;
        if (m.status === 'fulfilled') setMatches(m.value.data.matches);
        if (s.status === 'fulfilled') setSwaps(s.value.data.swaps);
        if (c.status === 'fulfilled') setChallenges(c.value.data.challenges);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const openRequest = ({ providerId, skillRequested, skillOffered, type }) => {
    const match = matches.find((m) => m.user._id === providerId);
    if (!match) return;
    setPrefill({ skillRequested, skillOffered, type });
    setModalTarget(match.user);
  };

  const submitSwap = async (payload) => {
    const { data } = await endpoints.swaps.create(payload);
    setSwaps((prev) => [data.swap, ...prev]);
    notify(`Request sent to ${data.swap.provider.name}`, { type: 'success' });
    await refreshUser();
  };

  if (loading) return <Spinner label="Loading your dashboard" />;

  const incoming = swaps.filter((s) => s.status === 'pending' && s.provider?._id === user.id);
  const active = swaps.filter((s) => s.status === 'accepted');
  const completed = swaps.filter((s) => s.status === 'completed');
  const mutualCount = matches.filter((m) => m.matchType === 'mutual').length;
  const greeting =
    mutualCount > 0
      ? `${mutualCount} mutual ${mutualCount === 1 ? 'match' : 'matches'} waiting for you.`
      : 'Add more skills to your profile to sharpen your matches.';
  const joinedChallenges = challenges.filter((c) => c.joined && !c.completed);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Hi {user.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{greeting}</p>
        </div>
        <Link to="/explore" className="btn-primary">
          <Sparkles size={16} />
          Find matches
        </Link>
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Coins}
          tone="mint"
          label="Time credits"
          value={user.wallet?.balance ?? 0}
          hint={`${user.wallet?.totalEarned ?? 0} earned / ${user.wallet?.totalSpent ?? 0} spent`}
        />
        <StatTile
          icon={ShieldCheck}
          tone="brand"
          label="Trust score"
          value={`${user.trustScore ?? 0}/100`}
          hint={`${user.trustStats?.totalReviews ?? 0} reviews`}
        />
        <StatTile
          icon={Repeat}
          tone="sky"
          label="Completed swaps"
          value={completed.length}
          hint={`${active.length} in progress`}
        />
        <StatTile
          icon={Inbox}
          tone="amber"
          label="Incoming requests"
          value={incoming.length}
          hint={incoming.length ? 'Respond to keep your rate up' : 'All caught up'}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Matches */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Your best matches</h2>
            <Link to="/explore" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
              See all <ArrowRight size={14} />
            </Link>
          </div>

          {matches.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No matches yet"
              description="Matching pairs what you offer with what others need. Add a few skills and they will appear here."
              action={
                <Link to="/profile" className="btn-primary">
                  Update skills
                </Link>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {matches.slice(0, 4).map((m) => (
                <MatchCard key={m.user._id} match={m} onRequest={openRequest} />
              ))}
            </div>
          )}
        </section>

        {/* Side column */}
        <div className="grid content-start gap-6">
          {/* Incoming requests */}
          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Requests for you</h2>
            {incoming.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Nothing waiting.</p>
            ) : (
              <ul className="grid gap-3">
                {incoming.slice(0, 4).map((s) => (
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

          {/* Trust breakdown */}
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Trust score</h2>
              <TrustBadge score={user.trustScore ?? 0} size="sm" />
            </div>

            <div className="grid gap-2.5 text-sm">
              {[
                ['Reviews', user.trustStats?.totalReviews ?? 0, `avg ${user.trustStats?.averageRating ?? 0}`],
                ['Completed swaps', user.trustStats?.completedSwaps ?? 0, ''],
                [
                  'Response rate',
                  `${Math.round((user.trustStats?.responseRate ?? 0) * 100)}%`,
                  `${user.trustStats?.requestsResponded ?? 0}/${user.trustStats?.requestsReceived ?? 0}`,
                ],
              ].map(([label, value, hint]) => (
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

          {/* Challenges */}
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Challenges</h2>
              <Link to="/challenges" className="text-sm font-medium text-brand-600 hover:underline">
                All
              </Link>
            </div>

            {joinedChallenges.length === 0 ? (
              <div className="py-3 text-center">
                <Trophy size={20} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">Join one to earn bonus credits.</p>
              </div>
            ) : (
              <ul className="grid gap-3">
                {joinedChallenges.slice(0, 3).map((c) => (
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

          {/* Activity */}
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <TrendingUp size={16} className="text-slate-400" />
              Recent activity
            </h2>
            {completed.length === 0 ? (
              <p className="py-3 text-center text-sm text-slate-400">No completed swaps yet.</p>
            ) : (
              <ul className="grid gap-2.5 text-sm">
                {completed.slice(0, 4).map((s) => {
                  const other = s.requester._id === user.id ? s.provider : s.requester;
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
        </div>
      </div>

      <SwapRequestModal
        open={Boolean(modalTarget)}
        target={modalTarget}
        prefill={prefill}
        onClose={() => setModalTarget(null)}
        onSubmit={submitSwap}
      />
    </div>
  );
}
