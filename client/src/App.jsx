import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Navbar from './components/Navbar';
import Toasts from './components/Toasts';
import { Spinner } from './components/ui';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Explore from './pages/Explore';
import Swaps from './pages/Swaps';
import Messages from './pages/Messages';
import Wallet from './pages/Wallet';
import Profile from './pages/Profile';
import Challenges from './pages/Challenges';

/** Gate for signed-in routes; remembers where the user was headed. */
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return children;
}

/** Signed-in users should not sit on the login screen. */
function RedirectIfAuthed({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main>{children}</main>
      <Toasts />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <Register />
          </RedirectIfAuthed>
        }
      />

      {[
        ['/dashboard', <Dashboard key="d" />],
        ['/explore', <Explore key="e" />],
        ['/swaps', <Swaps key="s" />],
        ['/messages', <Messages key="m" />],
        ['/messages/:swapId', <Messages key="mt" />],
        ['/wallet', <Wallet key="w" />],
        ['/challenges', <Challenges key="c" />],
        ['/profile', <Profile key="p" />],
        ['/profile/:id', <Profile key="pu" />],
      ].map(([path, element]) => (
        <Route
          key={path}
          path={path}
          element={
            <RequireAuth>
              <Shell>{element}</Shell>
            </RequireAuth>
          }
        />
      ))}

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="*"
        element={
          <div className="grid min-h-screen place-items-center px-4 text-center">
            <div>
              <p className="text-6xl font-bold text-slate-200">404</p>
              <p className="mt-2 font-semibold text-slate-700">That page does not exist</p>
              <a href="/dashboard" className="btn-primary mt-5">
                Back to dashboard
              </a>
            </div>
          </div>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AppRoutes />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
