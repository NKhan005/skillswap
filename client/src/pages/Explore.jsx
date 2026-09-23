import { useCallback, useEffect, useState } from 'react';
import { MapPin, Search, SlidersHorizontal, Sparkles, ArrowLeftRight, Users } from 'lucide-react';
import { endpoints } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Chip, EmptyState, ErrorNote, Spinner } from '../components/ui';
import MatchCard from '../components/MatchCard';
import SwapRequestModal from '../components/SwapRequestModal';

const RADII = [1, 5, 10, 20];
const CATEGORIES = [
  'Technology',
  'Design',
  'Languages',
  'Music',
  'Academics',
  'Fitness',
  'Business',
  'Crafts',
  'Cooking',
  'Other',
];

const MODES = [
  { id: 'matches', label: 'Smart matches', Icon: Sparkles },
  { id: 'nearby', label: 'Nearby', Icon: MapPin },
  { id: 'browse', label: 'Browse all', Icon: Users },
];

export default function Explore() {
  const { user, refreshUser, updateProfile } = useAuth();
  const { notify } = useNotifications();

  const [mode, setMode] = useState('matches');
  const [radius, setRadius] = useState(10);
  const [category, setCategory] = useState('');
  const [mutualOnly, setMutualOnly] = useState(false);
  const [query, setQuery] = useState('');

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalTarget, setModalTarget] = useState(null);
  const [prefill, setPrefill] = useState({});

  const hasLocation = Boolean(user?.location?.coordinates?.length === 2);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      if (mode === 'nearby') {
        const { data } = await endpoints.matching.nearby({
          radius,
          mutualOnly: mutualOnly || undefined,
          category: category || undefined,
          skillFilter: false, // show everyone in range, matched or not
        });
        setResults(data.matches);
      } else if (mode === 'browse') {
        const { data } = await endpoints.matching.explore({
          q: query || undefined,
          category: category || undefined,
        });
        // Reshape into the card's match shape so one component renders both.
        setResults(
          data.users.map((u) => ({
            user: u,
            matchType: 'nearby',
            theyTeachMe: [],
            iTeachThem: [],
            distanceKm: null,
            matchScore: u.trustScore ?? 0,
          }))
        );
      } else {
        const { data } = await endpoints.matching.direct({
          mutualOnly: mutualOnly || undefined,
          category: category || undefined,
        });
        setResults(data.matches);
      }
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [mode, radius, category, mutualOnly, query]);

  useEffect(() => {
    load();
  }, [load]);

  const shareLocation = () => {
    if (!navigator.geolocation) return setError('This browser cannot share a location');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await updateProfile({ coordinates: [pos.coords.longitude, pos.coords.latitude] });
        notify('Location saved', { type: 'success' });
        load();
      },
      () => setError('Could not read your location')
    );
  };

  const openRequest = ({ providerId, skillRequested, skillOffered, type }) => {
    const match = results.find((m) => m.user._id === providerId);
    if (!match) return;
    setPrefill({ skillRequested, skillOffered, type });
    setModalTarget(match.user);
  };

  const submitSwap = async (payload) => {
    const { data } = await endpoints.swaps.create(payload);
    notify(`Request sent to ${data.swap.provider.name}`, { type: 'success' });
    await refreshUser();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Explore</h1>
          <p className="mt-1 text-sm text-slate-500">
            Find someone who teaches what you need and needs what you teach.
          </p>
        </div>
      </div>

      {/* Mode switch */}
      <div className="mt-6 flex flex-wrap gap-2">
        {MODES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              mode === id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card mt-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SlidersHorizontal size={16} className="text-slate-400" />

          {mode === 'browse' && (
            <div className="relative min-w-56 flex-1">
              <Search size={15} className="absolute top-3 left-3 text-slate-400" />
              <input
                className="input py-2 pl-9"
                placeholder="Search names, skills, cities"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}

          <select className="input w-auto py-2" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>

          {mode === 'nearby' && (
            <div className="flex items-center gap-1.5">
              {RADII.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadius(r)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    radius === r ? 'bg-brand-100 text-brand-700' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {r} km
                </button>
              ))}
            </div>
          )}

          {mode !== 'browse' && (
            <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={mutualOnly}
                onChange={(e) => setMutualOnly(e.target.checked)}
              />
              <ArrowLeftRight size={14} />
              Mutual only
            </label>
          )}
        </div>
      </div>

      {mode === 'nearby' && !hasLocation && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            Nearby search needs your location. It is only used to compute distances.
          </p>
          <button type="button" onClick={shareLocation} className="btn-secondary">
            <MapPin size={15} />
            Share location
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {/* Results */}
      <div className="mt-6">
        {loading ? (
          <Spinner label="Finding people" />
        ) : results.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nothing here yet"
            description={
              mode === 'nearby'
                ? `No one within ${radius} km matches those filters. Try a wider radius.`
                : 'Try clearing the filters, or add more skills to your profile.'
            }
          />
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
              <span>{results.length} results</span>
              {mode === 'matches' && (
                <Chip tone="mint">{results.filter((r) => r.matchType === 'mutual').length} mutual</Chip>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((m) => (
                <MatchCard key={m.user._id} match={m} onRequest={openRequest} />
              ))}
            </div>
          </>
        )}
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
