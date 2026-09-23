import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Check, Medal, Users, Clock, Star } from 'lucide-react';
import { endpoints } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Avatar, Chip, EmptyState, Spinner, TrustBadge } from '../components/ui';

const METRIC_LABEL = {
  completed_swaps: 'completed swaps',
  people_taught: 'people taught',
  reviews_received: 'reviews received',
  hours_taught: 'hours taught',
};

export default function Challenges() {
  const { refreshUser } = useAuth();
  const { notify } = useNotifications();

  const [challenges, setChallenges] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(null);

  const load = async () => {
    const [c, l] = await Promise.allSettled([
      endpoints.challenges.list(),
      endpoints.challenges.leaderboard(),
    ]);
    if (c.status === 'fulfilled') setChallenges(c.value.data.challenges);
    if (l.status === 'fulfilled') setLeaders(l.value.data.leaders);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const join = async (challenge) => {
    setJoining(challenge._id);
    try {
      const { data } = await endpoints.challenges.join(challenge._id);
      notify(
        data.completed?.length
          ? `Already complete - ${challenge.rewardCredits} credits added`
          : `Joined "${challenge.title}"`,
        { type: 'success' }
      );
      await Promise.all([load(), refreshUser()]);
    } catch (err) {
      notify(err.message, { type: 'error' });
    } finally {
      setJoining(null);
    }
  };

  if (loading) return <Spinner label="Loading challenges" />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Community challenges</h1>
      <p className="mt-1 text-sm text-slate-500">
        Quests that pay bonus credits for keeping the community active.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <section>
          {challenges.length === 0 ? (
            <EmptyState icon={Trophy} title="No challenges running" description="Check back soon." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {challenges.map((c) => (
                <article key={c._id} className="card animate-fade-up flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                        c.completed ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {c.completed ? <Check size={20} /> : <Trophy size={20} />}
                    </span>
                    <Chip tone="mint">+{c.rewardCredits} credits</Chip>
                  </div>

                  <h2 className="mt-3 font-semibold text-slate-900">{c.title}</h2>
                  <p className="mt-1 flex-1 text-sm text-slate-500">{c.description}</p>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {c.progress} / {c.target} {METRIC_LABEL[c.metric]}
                      </span>
                      <span>{c.percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          c.completed ? 'bg-emerald-500' : 'bg-amber-400'
                        }`}
                        style={{ width: `${c.percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Users size={12} />
                      {c.participantCount} joined
                    </span>

                    {c.endsAt && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Clock size={12} />
                        {new Date(c.endsAt).toLocaleDateString()}
                      </span>
                    )}

                    <div className="ml-auto">
                      {c.completed ? (
                        <Chip tone="mint">
                          <Check size={12} />
                          Complete
                        </Chip>
                      ) : c.joined ? (
                        <Chip tone="sky">In progress</Chip>
                      ) : (
                        <button
                          type="button"
                          disabled={joining === c._id}
                          onClick={() => join(c)}
                          className="btn-primary px-3 py-1.5 text-xs"
                        >
                          {joining === c._id ? 'Joining...' : 'Join'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Leaderboard */}
        <aside className="card h-fit p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
            <Medal size={17} className="text-amber-500" />
            Top members
          </h2>

          {leaders.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No one ranked yet.</p>
          ) : (
            <ol className="grid gap-3">
              {leaders.slice(0, 10).map((l, i) => (
                <li key={l._id} className="flex items-center gap-2.5">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      i === 0
                        ? 'bg-amber-100 text-amber-700'
                        : i === 1
                          ? 'bg-slate-200 text-slate-600'
                          : i === 2
                            ? 'bg-orange-100 text-orange-700'
                            : 'text-slate-400'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <Avatar name={l.name} src={l.avatarUrl} size={30} />
                  <Link
                    to={`/profile/${l._id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 hover:text-brand-600"
                  >
                    {l.name}
                  </Link>
                  <TrustBadge score={l.trustScore ?? 0} size="sm" showLabel={false} />
                </li>
              ))}
            </ol>
          )}

          <p className="mt-4 flex items-start gap-1.5 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <Star size={12} className="mt-0.5 shrink-0" />
            Ranked by trust score, then completed swaps.
          </p>
        </aside>
      </div>
    </div>
  );
}
