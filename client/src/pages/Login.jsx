import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeftRight, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ErrorNote } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(form);
      // Send people back to whatever they were trying to open.
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Pitch panel */}
      <div className="hidden flex-col justify-between bg-brand-600 p-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15">
            <ArrowLeftRight size={20} />
          </span>
          <span className="text-lg font-bold">SkillSwap</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-tight">Exchange Skills, Not Money</h1>
          <p className="mt-4 text-brand-100">
            Teach what you know, learn what you need. Trade directly with someone nearby, or bank time
            credits and spend them whenever you like.
          </p>

          <dl className="mt-10 grid gap-5">
            {[
              ['Direct swaps', 'You teach React, they teach guitar. Nothing changes hands but skills.'],
              ['Time credits', 'Teach for two hours, earn two credits, spend them on anything later.'],
              ['Trust scores', 'Reviews, completed swaps and response rate, in one number.'],
            ].map(([term, desc]) => (
              <div key={term}>
                <dt className="font-semibold">{term}</dt>
                <dd className="text-sm text-brand-100">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-sm text-brand-200">A no-money economy for skills.</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
              <ArrowLeftRight size={20} />
            </span>
            <span className="text-lg font-bold text-slate-900">SkillSwap</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Log in to see who you can swap with today.</p>

          <form onSubmit={submit} className="mt-7 grid gap-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail size={16} className="absolute top-3.5 left-3.5 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="input pl-10"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute top-3.5 left-3.5 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="input pl-10"
                  placeholder="********"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>

            <ErrorNote>{error}</ErrorNote>

            <button type="submit" disabled={busy} className="btn-primary mt-1 w-full">
              {busy ? 'Logging in...' : 'Log in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            New here?{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
