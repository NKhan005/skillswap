import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  Bell,
  Coins,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Repeat,
  Search,
  Trophy,
  User as UserIcon,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Avatar, TrustBadge } from './ui';

const LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/explore', label: 'Explore', icon: Search },
  { to: '/swaps', label: 'Swaps', icon: Repeat },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/wallet', label: 'Wallet', icon: Coins },
  { to: '/challenges', label: 'Challenges', icon: Trophy },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { feed, clearFeed } = useNotifications();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);

  // Close the notification popover on an outside click.
  useEffect(() => {
    if (!bellOpen) return undefined;
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bellOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link to="/dashboard" className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
            <ArrowLeftRight size={18} />
          </span>
          <span className="hidden font-bold tracking-tight text-slate-900 sm:block">SkillSwap</span>
        </Link>

        <div className="mx-2 hidden flex-1 items-center gap-1 lg:flex">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Notifications */}
          <div className="relative" ref={bellRef}>
            <button
              type="button"
              onClick={() => setBellOpen((v) => !v)}
              className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100"
              aria-label={`Notifications${feed.length ? `, ${feed.length} unread` : ''}`}
            >
              <Bell size={19} />
              {feed.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {feed.length > 9 ? '9+' : feed.length}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="animate-fade-up absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Notifications</p>
                  {feed.length > 0 && (
                    <button type="button" onClick={clearFeed} className="text-xs font-medium text-brand-600 hover:underline">
                      Clear
                    </button>
                  )}
                </div>
                <div className="scroll-slim max-h-80 overflow-y-auto">
                  {feed.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-400">Nothing yet</p>
                  ) : (
                    feed.map((n) => (
                      <div key={n.id} className="border-b border-slate-50 px-4 py-3 last:border-0">
                        <p className="text-sm text-slate-700">{n.message}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Credit balance */}
          <Link
            to="/wallet"
            className="hidden items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 sm:flex"
            title="Time credits"
          >
            <Coins size={16} />
            {user.wallet?.balance ?? 0}
          </Link>

          <Link to="/profile" className="flex items-center gap-2 rounded-xl p-1 hover:bg-slate-100">
            <Avatar name={user.name} src={user.avatarUrl} size={34} />
            <span className="hidden text-sm font-medium text-slate-700 xl:block">{user.name}</span>
          </Link>

          <div className="hidden xl:block">
            <TrustBadge score={user.trustScore ?? 0} size="sm" showLabel={false} />
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="hidden rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-rose-600 lg:block"
            aria-label="Log out"
          >
            <LogOut size={18} />
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="animate-fade-up border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
          <div className="grid gap-1">
            {LINKS.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass} onClick={() => setMobileOpen(false)}>
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
            <NavLink to="/profile" className={linkClass} onClick={() => setMobileOpen(false)}>
              <UserIcon size={16} />
              Profile
            </NavLink>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
