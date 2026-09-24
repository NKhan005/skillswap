import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, ShieldCheck, Repeat, Sparkles, ArrowRight, Inbox } from 'lucide-react';
import { endpoints } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { EmptyState, Spinner, StatTile, TrustBadge } from '../components/ui';
import MatchCard from '../components/MatchCard';
import { IncomingRequests, ChallengeProgress, RecentActivity } from '../components/DashboardPanels';
import SwapRequestModal from '../components/SwapRequestModal';

/**
 * Everything the dashboard shows, fetched in one round. Settled rather than
 * all-or-nothing: one failing endpoint should dim its own panel, not blank
 * the whole page.
 */
function useDashboardData() {
  const [data, setData] = useState({ matches: [], swaps: [], challenges: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [m, s, c] = await Promise.allSettled([
        endpoints.matching.direct({ limit: 6 }),
        endpoints.swaps.list(),
        endpoints.challenges.list(),
      ]);

      if (cancelled) return;

      setData({
        matches: m.status === 'fulfilled' ? m.value.data.matches : [],
        swaps: s.status === 'fulfilled' ? s.value.data.swaps : [],
        challenges: c.status === 'fulfilled' ? c.value.data.challenges : [],
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { ...data, loading, setSwaps: (fn) => setData((d) => ({ ...d, swaps: fn(d.swaps) })) };
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const { notify } = useNotifications();

  const { matches, swaps, challenges, loading, setSwaps } = useDashboardData();
  const [modalTarget, setModalTarget] = useState(null);
  const [prefill, setPrefill] = useState({});

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
  const matchWord = mutualCount === 1 ? 'match' : 'matches';
  const greeting =
    mutualCount > 0
      ? `${mutualCount} mutual ${matchWord} waiting for you.`
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
          <IncomingRequests swaps={incoming} />

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

          <ChallengeProgress challenges={joinedChallenges} />

          <RecentActivity swaps={completed} viewerId={user.id} />
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
