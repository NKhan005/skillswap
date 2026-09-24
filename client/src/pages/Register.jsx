import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, MapPin, Plus, X, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ErrorNote, Chip } from '../components/ui';

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

/** Two-step signup: account first, then the skills that make matching work. */
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    city: '',
    bio: '',
    experienceLevel: 'beginner',
  });
  const [coordinates, setCoordinates] = useState(null);
  const [offered, setOffered] = useState([]);
  const [needed, setNeeded] = useState([]);
  const [offerDraft, setOfferDraft] = useState({ name: '', category: 'Technology', experienceLevel: 'intermediate' });
  const [needDraft, setNeedDraft] = useState({ name: '', category: 'Technology', urgency: 'medium' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const detectLocation = () => {
    if (!navigator.geolocation) return setError('This browser cannot share a location');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // GeoJSON order is [longitude, latitude].
        setCoordinates([pos.coords.longitude, pos.coords.latitude]);
        setLocating(false);
      },
      () => {
        setError('Could not read your location. You can add it later from your profile.');
        setLocating(false);
      },
      { timeout: 10000 }
    );
  };

  /** Case-insensitive duplicate check, so a list cannot hold the same skill
   *  twice - which also keeps the name usable as a stable React key. */
  const alreadyListed = (list, name) =>
    list.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());

  const addOffer = () => {
    const name = offerDraft.name.trim();
    if (!name || alreadyListed(offered, name)) {
      setOfferDraft({ ...offerDraft, name: '' });
      return;
    }
    setOffered([...offered, { ...offerDraft, name }]);
    setOfferDraft({ ...offerDraft, name: '' });
  };

  const addNeed = () => {
    const name = needDraft.name.trim();
    if (!name || alreadyListed(needed, name)) {
      setNeedDraft({ ...needDraft, name: '' });
      return;
    }
    setNeeded([...needed, { ...needDraft, name }]);
    setNeedDraft({ ...needDraft, name: '' });
  };

  /** Enter adds the skill. Written as a statement body rather than a comma
   *  expression so nothing reads the return value of a void function. */
  const addOnEnter = (e, add) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    add();
  };

  const goToStepTwo = (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    setStep(2);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register({
        ...form,
        skillsOffered: offered,
        skillsNeeded: needed,
        ...(coordinates ? { coordinates } : {}),
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.details ? Object.values(err.details).join('. ') : err.message);
      setStep(1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-7 flex items-center justify-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
            <ArrowLeftRight size={20} />
          </span>
          <span className="text-lg font-bold text-slate-900">SkillSwap</span>
        </div>

        <div className="card p-6 sm:p-8">
          {/* Step indicator */}
          <div className="mb-6 flex items-center gap-3">
            {[1, 2].map((n) => (
              <div key={n} className="flex flex-1 items-center gap-2">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    step >= n ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {step > n ? <Check size={14} /> : n}
                </span>
                <span className={`text-sm font-medium ${step >= n ? 'text-slate-800' : 'text-slate-400'}`}>
                  {n === 1 ? 'Your account' : 'Your skills'}
                </span>
              </div>
            ))}
          </div>

          {step === 1 ? (
            <form onSubmit={goToStepTwo} className="grid gap-4">
              <div>
                <label className="label" htmlFor="name">
                  Full name
                </label>
                <input id="name" required className="input" value={form.name} onChange={set('name')} />
              </div>

              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="input"
                  value={form.email}
                  onChange={set('email')}
                />
              </div>

              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="input"
                  value={form.password}
                  onChange={set('password')}
                />
                <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="city">
                    City
                  </label>
                  <input id="city" className="input" value={form.city} onChange={set('city')} />
                </div>
                <div>
                  <label className="label" htmlFor="experience">
                    Overall experience
                  </label>
                  <select
                    id="experience"
                    className="input"
                    value={form.experienceLevel}
                    onChange={set('experienceLevel')}
                  >
                    {['beginner', 'intermediate', 'advanced', 'expert'].map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="bio">
                  Short bio
                </label>
                <textarea
                  id="bio"
                  rows={2}
                  className="input resize-none"
                  placeholder="What do you do, and what are you hoping to learn?"
                  value={form.bio}
                  onChange={set('bio')}
                />
              </div>

              <button
                type="button"
                onClick={detectLocation}
                className={`btn-secondary justify-start ${coordinates ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''}`}
              >
                <MapPin size={16} />
                {locating
                  ? 'Finding you...'
                  : coordinates
                    ? `Location set (${coordinates[1].toFixed(3)}, ${coordinates[0].toFixed(3)})`
                    : 'Use my location for nearby matches'}
              </button>

              <ErrorNote>{error}</ErrorNote>

              <button type="submit" className="btn-primary w-full">
                Continue
              </button>
            </form>
          ) : (
            <form onSubmit={submit} className="grid gap-6">
              {/* Skills offered */}
              <section>
                <h3 className="font-semibold text-slate-800">Skills you can teach</h3>
                <p className="mb-3 text-sm text-slate-500">These are what you bring to a swap.</p>

                <div className="flex flex-wrap gap-2">
                  {offered.map((s, i) => (
                    <Chip key={s.name} tone="brand">
                      {s.name}
                      <button type="button" onClick={() => setOffered(offered.filter((_, j) => j !== i))}>
                        <X size={12} />
                      </button>
                    </Chip>
                  ))}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    className="input"
                    placeholder="e.g. React"
                    value={offerDraft.name}
                    onChange={(e) => setOfferDraft({ ...offerDraft, name: e.target.value })}
                    onKeyDown={(e) => addOnEnter(e, addOffer)}
                  />
                  <select
                    className="input sm:w-36"
                    value={offerDraft.category}
                    onChange={(e) => setOfferDraft({ ...offerDraft, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <button type="button" onClick={addOffer} className="btn-secondary">
                    <Plus size={16} />
                  </button>
                </div>
              </section>

              {/* Skills needed */}
              <section>
                <h3 className="font-semibold text-slate-800">Skills you want to learn</h3>
                <p className="mb-3 text-sm text-slate-500">
                  Matching looks for people who teach these and want what you offer.
                </p>

                <div className="flex flex-wrap gap-2">
                  {needed.map((s, i) => (
                    <Chip key={s.name} tone="amber">
                      {s.name}
                      <button type="button" onClick={() => setNeeded(needed.filter((_, j) => j !== i))}>
                        <X size={12} />
                      </button>
                    </Chip>
                  ))}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    className="input"
                    placeholder="e.g. Guitar"
                    value={needDraft.name}
                    onChange={(e) => setNeedDraft({ ...needDraft, name: e.target.value })}
                    onKeyDown={(e) => addOnEnter(e, addNeed)}
                  />
                  <select
                    className="input sm:w-36"
                    value={needDraft.category}
                    onChange={(e) => setNeedDraft({ ...needDraft, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <button type="button" onClick={addNeed} className="btn-secondary">
                    <Plus size={16} />
                  </button>
                </div>
              </section>

              <ErrorNote>{error}</ErrorNote>

              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1">
                  Back
                </button>
                <button type="submit" disabled={busy} className="btn-primary flex-1">
                  {busy ? 'Creating...' : 'Create account'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already a member?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
