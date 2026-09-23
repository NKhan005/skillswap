import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  X,
  Clock,
  MessageSquare,
  CheckCheck,
  Coins,
  ArrowLeftRight,
  MapPin,
  Star,
} from 'lucide-react';
import { endpoints } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Avatar, Chip, EmptyState, ErrorNote, Spinner, Stars } from '../components/ui';

const TABS = [
  { id: 'incoming', label: 'Incoming' },
  { id: 'outgoing', label: 'Sent' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
];

const STATUS_TONE = {
  pending: 'amber',
  accepted: 'sky',
  completed: 'mint',
  cancelled: 'slate',
  declined: 'rose',
};

/** Rating dialog shown after a swap completes (feature 5). */
function ReviewModal({ swap, onClose, onSubmit }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!swap) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({ swapId: swap._id, rating, comment });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className="animate-fade-up w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <h2 className="font-semibold text-slate-900">How did it go?</h2>
        <p className="mt-1 text-sm text-slate-500">
          Your rating feeds their trust score, so be honest and specific.
        </p>

        <div className="mt-5 flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              className="rounded-lg p-1 transition hover:scale-110"
            >
              <Star
                size={30}
                className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
              />
            </button>
          ))}
        </div>

        <textarea
          rows={3}
          className="input mt-5 resize-none"
          placeholder="Excellent coding mentor - patient and clear."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Later
          </button>
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            {busy ? 'Sending...' : 'Submit review'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SwapCard({ swap, me, onAction, onReview, reviewed }) {
  const isProvider = swap.provider._id === me;
  const other = isProvider ? swap.requester : swap.provider;
  const [busy, setBusy] = useState(false);

  const act = async (action) => {
    setBusy(true);
    try {
      await onAction(action, swap);
    } finally {
      setBusy(false);
    }
  };

  const myConfirm = isProvider ? swap.providerConfirmed : swap.requesterConfirmed;
  const theirConfirm = isProvider ? swap.requesterConfirmed : swap.providerConfirmed;

  return (
    <article className="card animate-fade-up p-5">
      <div className="flex items-start gap-3">
        <Avatar name={other.name} src={other.avatarUrl} size={44} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/profile/${other._id}`} className="font-semibold text-slate-900 hover:text-brand-600">
              {other.name}
            </Link>
            <Chip tone={STATUS_TONE[swap.status]}>{swap.status}</Chip>
            <Chip tone={swap.type === 'credit' ? 'mint' : 'brand'}>
              {swap.type === 'credit' ? <Coins size={11} /> : <ArrowLeftRight size={11} />}
              {swap.type === 'credit' ? `${swap.creditCost} credits` : 'direct'}
            </Chip>
          </div>

          <p className="mt-2 text-sm text-slate-700">
            {isProvider ? (
              <>
                They want <span className="font-semibold">{swap.skillRequested}</span>
                {swap.skillOffered && (
                  <>
                    {' '}
                    and offer <span className="font-semibold">{swap.skillOffered}</span>
                  </>
                )}
              </>
            ) : (
              <>
                You learn <span className="font-semibold">{swap.skillRequested}</span>
                {swap.skillOffered && (
                  <>
                    {' '}
                    and teach <span className="font-semibold">{swap.skillOffered}</span>
                  </>
                )}
              </>
            )}
          </p>

          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} />
              {swap.hours}h
            </span>
            {swap.meetingLocation && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} />
                {swap.meetingLocation}
              </span>
            )}
            <span>{new Date(swap.createdAt).toLocaleDateString()}</span>
          </div>

          {swap.message && (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{swap.message}</p>
          )}

          {swap.status === 'accepted' && (myConfirm || theirConfirm) && (
            <p className="mt-3 text-xs font-medium text-sky-700">
              {myConfirm && !theirConfirm && 'Waiting for them to confirm completion.'}
              {!myConfirm && theirConfirm && 'They marked this done - confirm to settle it.'}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {swap.status === 'pending' && isProvider && (
          <>
            <button type="button" disabled={busy} onClick={() => act('accept')} className="btn-primary">
              <Check size={15} />
              Accept
            </button>
            <button type="button" disabled={busy} onClick={() => act('decline')} className="btn-danger">
              <X size={15} />
              Decline
            </button>
          </>
        )}

        {swap.status === 'pending' && !isProvider && (
          <button type="button" disabled={busy} onClick={() => act('cancel')} className="btn-secondary">
            Withdraw request
          </button>
        )}

        {swap.status === 'accepted' && (
          <>
            <button
              type="button"
              disabled={busy || myConfirm}
              onClick={() => act('complete')}
              className="btn-primary"
            >
              <CheckCheck size={15} />
              {myConfirm ? 'Confirmed' : 'Mark complete'}
            </button>
            <button type="button" disabled={busy} onClick={() => act('cancel')} className="btn-secondary">
              Cancel
            </button>
          </>
        )}

        {swap.status === 'completed' && !reviewed && (
          <button type="button" onClick={() => onReview(swap)} className="btn-primary">
            <Star size={15} />
            Leave a review
          </button>
        )}

        {swap.status === 'completed' && reviewed && (
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
            <Stars rating={5} size={13} />
            Reviewed
          </span>
        )}

        <Link to={`/messages/${swap._id}`} className="btn-ghost ml-auto">
          <MessageSquare size={15} />
          Chat
        </Link>
      </div>
    </article>
  );
}

export default function Swaps() {
  const { user, refreshUser } = useAuth();
  const { notify } = useNotifications();

  const [swaps, setSwaps] = useState([]);
  const [pendingReviews, setPendingReviews] = useState([]);
  const [tab, setTab] = useState('incoming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewTarget, setReviewTarget] = useState(null);

  const load = async () => {
    try {
      const [s, p] = await Promise.all([endpoints.swaps.list(), endpoints.reviews.pending()]);
      setSwaps(s.data.swaps);
      setPendingReviews(p.data.swaps.map((x) => String(x._id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAction = async (action, swap) => {
    try {
      const { data } = await endpoints.swaps[action](swap._id);
      setSwaps((prev) => prev.map((s) => (s._id === data.swap._id ? data.swap : s)));

      const messages = {
        accept: 'Swap accepted. Arrange the details in chat.',
        decline: 'Request declined.',
        cancel: 'Swap cancelled.',
        complete: data.swap.status === 'completed' ? 'Swap completed and credits settled.' : 'Marked complete - waiting on them.',
      };
      notify(messages[action], { type: action === 'decline' ? 'warning' : 'success' });

      if (data.swap.status === 'completed') {
        await refreshUser();
        setPendingReviews((prev) => [...prev, String(data.swap._id)]);
      }
    } catch (err) {
      notify(err.message, { type: 'error' });
    }
  };

  const submitReview = async (payload) => {
    await endpoints.reviews.create(payload);
    setPendingReviews((prev) => prev.filter((id) => id !== String(payload.swapId)));
    notify('Review submitted. Their trust score has been updated.', { type: 'success' });
  };

  const filtered = useMemo(() => {
    const me = user?.id;
    switch (tab) {
      case 'incoming':
        return swaps.filter((s) => s.status === 'pending' && s.provider._id === me);
      case 'outgoing':
        return swaps.filter((s) => s.status === 'pending' && s.requester._id === me);
      case 'active':
        return swaps.filter((s) => s.status === 'accepted');
      case 'completed':
        return swaps.filter((s) => ['completed', 'cancelled', 'declined'].includes(s.status));
      default:
        return swaps;
    }
  }, [swaps, tab, user]);

  const counts = useMemo(() => {
    const me = user?.id;
    return {
      incoming: swaps.filter((s) => s.status === 'pending' && s.provider._id === me).length,
      outgoing: swaps.filter((s) => s.status === 'pending' && s.requester._id === me).length,
      active: swaps.filter((s) => s.status === 'accepted').length,
      completed: swaps.filter((s) => ['completed', 'cancelled', 'declined'].includes(s.status)).length,
    };
  }, [swaps, user]);

  if (loading) return <Spinner label="Loading your swaps" />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Swaps</h1>
      <p className="mt-1 text-sm text-slate-500">Requests, sessions in progress, and everything settled.</p>

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {label}
            {counts[id] > 0 && (
              <span className={`ml-1.5 text-xs ${tab === id ? 'text-brand-100' : 'text-slate-400'}`}>
                {counts[id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-6 grid gap-4">
        {filtered.length === 0 ? (
          <EmptyState
            title="Nothing in this tab"
            description={
              tab === 'incoming'
                ? 'When someone requests one of your skills it will show up here.'
                : 'Find a match in Explore to start your first swap.'
            }
          />
        ) : (
          filtered.map((s) => (
            <SwapCard
              key={s._id}
              swap={s}
              me={user.id}
              onAction={handleAction}
              onReview={setReviewTarget}
              reviewed={s.status === 'completed' && !pendingReviews.includes(String(s._id))}
            />
          ))
        )}
      </div>

      <ReviewModal swap={reviewTarget} onClose={() => setReviewTarget(null)} onSubmit={submitReview} />
    </div>
  );
}
