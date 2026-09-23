import { useEffect, useState } from 'react';
import { Coins, TrendingUp, TrendingDown, Gift, ArrowDownLeft, ArrowUpRight, Trophy } from 'lucide-react';
import { endpoints } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Avatar, Chip, EmptyState, Spinner, StatTile } from '../components/ui';

const TYPE_META = {
  earned: { label: 'Earned', tone: 'mint', Icon: ArrowDownLeft, sign: '+' },
  spent: { label: 'Spent', tone: 'rose', Icon: ArrowUpRight, sign: '-' },
  challenge_reward: { label: 'Challenge', tone: 'amber', Icon: Trophy, sign: '+' },
  signup_bonus: { label: 'Welcome bonus', tone: 'brand', Icon: Gift, sign: '+' },
  refund: { label: 'Refund', tone: 'sky', Icon: ArrowDownLeft, sign: '+' },
};

export default function Wallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [w, l, s] = await Promise.allSettled([
        endpoints.wallet.get(),
        endpoints.wallet.ledger({ page, limit: 15 }),
        endpoints.wallet.stats(),
      ]);
      if (w.status === 'fulfilled') setWallet(w.value.data.wallet);
      if (l.status === 'fulfilled') {
        setLedger(l.value.data.transactions);
        setPages(l.value.data.pages);
      }
      if (s.status === 'fulfilled') setMonthly(s.value.data.monthly);
      setLoading(false);
    })();
  }, [page]);

  if (loading) return <Spinner label="Opening your wallet" />;

  const balance = wallet?.balance ?? user.wallet?.balance ?? 0;
  const peak = Math.max(1, ...monthly.map((m) => Math.max(m.earned, m.spent)));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Skill wallet</h1>
      <p className="mt-1 text-sm text-slate-500">
        One credit is one hour of teaching. Earn by teaching, spend to learn.
      </p>

      {/* Balance hero */}
      <div className="mt-6 overflow-hidden rounded-2xl bg-brand-600 p-6 text-white sm:p-8">
        <p className="text-sm font-medium text-brand-100">Current balance</p>
        <div className="mt-1 flex items-end gap-2">
          <Coins size={32} className="mb-1 text-brand-200" />
          <span className="text-5xl font-bold tracking-tight">{balance}</span>
          <span className="mb-1.5 text-lg text-brand-100">credits</span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/20 pt-5 text-sm">
          <div>
            <p className="text-brand-200">Total earned</p>
            <p className="mt-0.5 text-xl font-semibold">{wallet?.totalEarned ?? 0}</p>
          </div>
          <div>
            <p className="text-brand-200">Total spent</p>
            <p className="mt-0.5 text-xl font-semibold">{wallet?.totalSpent ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatTile
          icon={TrendingUp}
          tone="mint"
          label="Hours taught"
          value={user.trustStats?.completedSwaps ?? 0}
          hint="Completed swaps"
        />
        <StatTile
          icon={TrendingDown}
          tone="amber"
          label="Credits in flight"
          value={ledger.filter((t) => t.swap?.status === 'accepted').length}
          hint="Swaps not yet settled"
        />
      </div>

      {/* Six-month bars */}
      {monthly.length > 0 && (
        <section className="card mt-6 p-5">
          <h2 className="font-semibold text-slate-900">Last six months</h2>
          {/* Columns are capped so a single month does not stretch into a
              full-width block; the row stays left-aligned as months fill in. */}
          <div className="mt-5 flex h-40 items-end gap-4">
            {monthly.map((m) => (
              <div key={m.month} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <div className="flex h-32 w-full items-end justify-center gap-1.5">
                  <div
                    className="w-5 rounded-t-md bg-emerald-400"
                    // A non-zero amount always shows a sliver, so an empty bar
                    // reads as "nothing" rather than "too small to see".
                    style={{ height: m.earned ? `${Math.max(4, (m.earned / peak) * 100)}%` : 0 }}
                    title={`${m.earned} earned`}
                  />
                  <div
                    className="w-5 rounded-t-md bg-rose-300"
                    style={{ height: m.spent ? `${Math.max(4, (m.spent / peak) * 100)}%` : 0 }}
                    title={`${m.spent} spent`}
                  />
                </div>
                <span className="text-xs text-slate-400">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-center gap-5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> earned
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-300" /> spent
            </span>
          </div>
        </section>
      )}

      {/* Ledger */}
      <section className="mt-6">
        <h2 className="mb-3 font-semibold text-slate-900">Transaction ledger</h2>

        {ledger.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No transactions yet"
            description="Teach someone a skill and your first credits land here."
          />
        ) : (
          <div className="card divide-y divide-slate-100">
            {ledger.map((t) => {
              const meta = TYPE_META[t.type] || TYPE_META.earned;
              const { Icon } = meta;
              return (
                <div key={t._id} className="flex items-center gap-3 p-4">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                      meta.sign === '+' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}
                  >
                    <Icon size={18} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {t.description || meta.label}
                      </p>
                      <Chip tone={meta.tone}>{meta.label}</Chip>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                      {t.counterparty && (
                        <>
                          <Avatar name={t.counterparty.name} size={16} />
                          {t.counterparty.name}
                          <span>&middot;</span>
                        </>
                      )}
                      {new Date(t.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-sm font-bold ${
                        meta.sign === '+' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {meta.sign}
                      {t.amount}
                    </p>
                    <p className="text-xs text-slate-400">bal {t.balanceAfter}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="btn-secondary"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              disabled={page === pages}
              onClick={() => setPage((p) => p + 1)}
              className="btn-secondary"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
