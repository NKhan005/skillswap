import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  MapPin,
  Plus,
  X,
  GitBranch,
  Link2,
  Code2,
  Award,
  Save,
  BadgeCheck,
  Briefcase,
} from 'lucide-react';
import { endpoints } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Avatar, Chip, ErrorNote, Spinner, Stars, TrustBadge } from '../components/ui';
import SwapRequestModal from '../components/SwapRequestModal';

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
const LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];

/** Someone else's profile: read-only, with a request button. */
function PublicProfile({ id }) {
  const { refreshUser } = useAuth();
  const { notify } = useNotifications();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await endpoints.auth.profile(id);
        setData(res.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <Spinner label="Loading profile" />;
  if (!data) return <p className="py-20 text-center text-slate-500">Profile not found.</p>;

  const { user, reviews } = data;
  const v = user.verification || {};
  const links = [
    v.githubUrl && { href: v.githubUrl, label: 'GitHub', Icon: GitBranch },
    v.leetcodeUrl && { href: v.leetcodeUrl, label: 'LeetCode', Icon: Code2 },
    v.portfolioUrl && { href: v.portfolioUrl, label: 'Portfolio', Icon: Link2 },
    v.linkedinUrl && { href: v.linkedinUrl, label: 'LinkedIn', Icon: Briefcase },
  ].filter(Boolean);

  const submitSwap = async (payload) => {
    const { data: res } = await endpoints.swaps.create(payload);
    notify(`Request sent to ${res.swap.provider.name}`, { type: 'success' });
    await refreshUser();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="card p-6">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={user.name} src={user.avatarUrl} size={72} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{user.name}</h1>
              <TrustBadge score={user.trustScore ?? 0} />
              {v.isVerified && (
                <Chip tone="sky">
                  <BadgeCheck size={12} />
                  Verified
                </Chip>
              )}
            </div>

            {user.city && (
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-500">
                <MapPin size={13} />
                {user.city}
              </p>
            )}
            {user.bio && <p className="mt-3 text-sm text-slate-600">{user.bio}</p>}
          </div>

          <button type="button" onClick={() => setModalOpen(true)} className="btn-primary">
            Request a swap
          </button>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-slate-100 pt-5 text-center">
          {[
            ['Completed swaps', user.trustStats?.completedSwaps ?? 0],
            ['Reviews', user.trustStats?.totalReviews ?? 0],
            ['Avg rating', user.trustStats?.averageRating ?? 0],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {links.length > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Verification</h2>
          <div className="flex flex-wrap gap-2">
            {links.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-sm"
              >
                <Icon size={15} />
                {label}
              </a>
            ))}
          </div>
          {(v.certifications || []).length > 0 && (
            <ul className="mt-4 grid gap-2">
              {v.certifications.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                  <Award size={15} className="text-amber-500" />
                  <span className="font-medium text-slate-800">{c.title}</span>
                  {c.issuer && <span className="text-slate-400">- {c.issuer}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Teaches</h2>
          <div className="flex flex-wrap gap-2">
            {(user.skillsOffered || []).map((s) => (
              <Chip key={s._id || s.name} tone="brand">
                {s.name}
                <span className="opacity-60">&middot; {s.experienceLevel}</span>
              </Chip>
            ))}
            {(user.skillsOffered || []).length === 0 && <p className="text-sm text-slate-400">Nothing listed.</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Wants to learn</h2>
          <div className="flex flex-wrap gap-2">
            {(user.skillsNeeded || []).map((s) => (
              <Chip key={s._id || s.name} tone="amber">
                {s.name}
              </Chip>
            ))}
            {(user.skillsNeeded || []).length === 0 && <p className="text-sm text-slate-400">Nothing listed.</p>}
          </div>
        </section>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="mb-3 font-semibold text-slate-900">Reviews</h2>
        {reviews.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No reviews yet.</p>
        ) : (
          <ul className="grid gap-4">
            {reviews.map((r) => (
              <li key={r._id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <Avatar name={r.reviewer?.name || 'Member'} size={28} />
                  <span className="text-sm font-medium text-slate-800">{r.reviewer?.name}</span>
                  <Stars rating={r.rating} size={13} />
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {r.comment && <p className="mt-2 text-sm text-slate-600">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SwapRequestModal
        open={modalOpen}
        target={user}
        onClose={() => setModalOpen(false)}
        onSubmit={submitSwap}
      />
    </div>
  );
}

/** Your own profile: editable skills, location and verification links. */
function MyProfile() {
  const { user, updateProfile } = useAuth();
  const { notify } = useNotifications();

  const [form, setForm] = useState({
    name: user.name,
    bio: user.bio || '',
    city: user.city || '',
    experienceLevel: user.experienceLevel || 'beginner',
  });
  const [offered, setOffered] = useState(user.skillsOffered || []);
  const [needed, setNeeded] = useState(user.skillsNeeded || []);
  const [verification, setVerification] = useState({
    githubUrl: user.verification?.githubUrl || '',
    leetcodeUrl: user.verification?.leetcodeUrl || '',
    portfolioUrl: user.verification?.portfolioUrl || '',
    linkedinUrl: user.verification?.linkedinUrl || '',
    certifications: user.verification?.certifications || [],
  });
  const [certDraft, setCertDraft] = useState({ title: '', issuer: '', credentialUrl: '' });
  const [offerDraft, setOfferDraft] = useState({ name: '', category: 'Technology', experienceLevel: 'intermediate' });
  const [needDraft, setNeedDraft] = useState({ name: '', category: 'Technology', urgency: 'medium' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await updateProfile({ ...form, skillsOffered: offered, skillsNeeded: needed, verification });
      notify('Profile saved', { type: 'success' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const shareLocation = () => {
    if (!navigator.geolocation) return setError('This browser cannot share a location');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await updateProfile({ coordinates: [pos.coords.longitude, pos.coords.latitude] });
        notify('Location updated', { type: 'success' });
      },
      () => setError('Could not read your location')
    );
  };

  const addCert = () => {
    if (!certDraft.title.trim()) return;
    setVerification({ ...verification, certifications: [...verification.certifications, certDraft] });
    setCertDraft({ title: '', issuer: '', credentialUrl: '' });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your profile</h1>
          <p className="mt-1 text-sm text-slate-500">
            The skills here are what the matching engine works with.
          </p>
        </div>
        <TrustBadge score={user.trustScore ?? 0} />
      </div>

      {/* Basics */}
      <section className="card mt-6 p-5">
        <h2 className="mb-4 font-semibold text-slate-900">Basics</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="p-name">Name</label>
            <input id="p-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="p-city">City</label>
            <input id="p-city" className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="p-bio">Bio</label>
          <textarea
            id="p-bio"
            rows={3}
            className="input resize-none"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="p-level">Overall experience</label>
            <select
              id="p-level"
              className="input"
              value={form.experienceLevel}
              onChange={(e) => setForm({ ...form, experienceLevel: e.target.value })}
            >
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={shareLocation} className="btn-secondary w-full">
              <MapPin size={15} />
              {user.location?.coordinates ? 'Update location' : 'Set location'}
            </button>
          </div>
        </div>
      </section>

      {/* Skills offered */}
      <section className="card mt-4 p-5">
        <h2 className="font-semibold text-slate-900">Skills you teach</h2>
        <p className="mb-3 text-sm text-slate-500">Others find you by these.</p>

        <div className="flex flex-wrap gap-2">
          {offered.map((s, i) => (
            <Chip key={s._id || `${s.name}-${i}`} tone="brand">
              {s.name}
              <span className="opacity-60">&middot; {s.experienceLevel}</span>
              <button type="button" onClick={() => setOffered(offered.filter((_, j) => j !== i))}>
                <X size={12} />
              </button>
            </Chip>
          ))}
          {offered.length === 0 && <p className="text-sm text-slate-400">Nothing yet.</p>}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input
            className="input"
            placeholder="Skill name"
            value={offerDraft.name}
            onChange={(e) => setOfferDraft({ ...offerDraft, name: e.target.value })}
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
          <select
            className="input sm:w-36"
            value={offerDraft.experienceLevel}
            onChange={(e) => setOfferDraft({ ...offerDraft, experienceLevel: e.target.value })}
          >
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (!offerDraft.name.trim()) return;
              setOffered([...offered, { ...offerDraft, name: offerDraft.name.trim() }]);
              setOfferDraft({ ...offerDraft, name: '' });
            }}
          >
            <Plus size={16} />
          </button>
        </div>
      </section>

      {/* Skills needed */}
      <section className="card mt-4 p-5">
        <h2 className="font-semibold text-slate-900">Skills you want</h2>
        <p className="mb-3 text-sm text-slate-500">A mutual match needs both directions to line up.</p>

        <div className="flex flex-wrap gap-2">
          {needed.map((s, i) => (
            <Chip key={s._id || `${s.name}-${i}`} tone="amber">
              {s.name}
              <button type="button" onClick={() => setNeeded(needed.filter((_, j) => j !== i))}>
                <X size={12} />
              </button>
            </Chip>
          ))}
          {needed.length === 0 && <p className="text-sm text-slate-400">Nothing yet.</p>}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            className="input"
            placeholder="Skill name"
            value={needDraft.name}
            onChange={(e) => setNeedDraft({ ...needDraft, name: e.target.value })}
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
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (!needDraft.name.trim()) return;
              setNeeded([...needed, { ...needDraft, name: needDraft.name.trim() }]);
              setNeedDraft({ ...needDraft, name: '' });
            }}
          >
            <Plus size={16} />
          </button>
        </div>
      </section>

      {/* Verification (feature 9) */}
      <section className="card mt-4 p-5">
        <h2 className="font-semibold text-slate-900">Skill verification</h2>
        <p className="mb-4 text-sm text-slate-500">
          Proof of work raises how seriously people take your offer.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['githubUrl', 'GitHub profile', GitBranch, 'https://github.com/you'],
            ['leetcodeUrl', 'LeetCode', Code2, 'https://leetcode.com/you'],
            ['portfolioUrl', 'Portfolio', Link2, 'https://you.dev'],
            ['linkedinUrl', 'LinkedIn', Briefcase, 'https://linkedin.com/in/you'],
          ].map(([key, label, Icon, placeholder]) => (
            <div key={key}>
              <label className="label inline-flex items-center gap-1.5" htmlFor={key}>
                <Icon size={14} />
                {label}
              </label>
              <input
                id={key}
                className="input"
                placeholder={placeholder}
                value={verification[key]}
                onChange={(e) => setVerification({ ...verification, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="mt-5">
          <p className="label">Certifications</p>
          <ul className="grid gap-2">
            {verification.certifications.map((c, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <Award size={15} className="text-amber-500" />
                <span className="font-medium text-slate-800">{c.title}</span>
                {c.issuer && <span className="text-slate-500">- {c.issuer}</span>}
                <button
                  type="button"
                  className="ml-auto text-slate-400 hover:text-rose-600"
                  onClick={() =>
                    setVerification({
                      ...verification,
                      certifications: verification.certifications.filter((_, j) => j !== i),
                    })
                  }
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              className="input"
              placeholder="Certification title"
              value={certDraft.title}
              onChange={(e) => setCertDraft({ ...certDraft, title: e.target.value })}
            />
            <input
              className="input"
              placeholder="Issuer"
              value={certDraft.issuer}
              onChange={(e) => setCertDraft({ ...certDraft, issuer: e.target.value })}
            />
            <button type="button" onClick={addCert} className="btn-secondary">
              <Plus size={16} />
            </button>
          </div>
        </div>
      </section>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="sticky bottom-4 mt-6">
        <button type="button" onClick={save} disabled={busy} className="btn-primary w-full shadow-lg">
          <Save size={16} />
          {busy ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}

export default function Profile() {
  const { id } = useParams();
  const { user } = useAuth();

  if (id && id !== user.id) return <PublicProfile id={id} />;
  return <MyProfile />;
}
