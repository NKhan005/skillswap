import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { on } from '../api/socket';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

let nextId = 1;

export function NotificationProvider({ children }) {
  const { user, refreshUser } = useAuth();
  const [toasts, setToasts] = useState([]);
  const [feed, setFeed] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message, { type = 'info', ttl = 5000, persist = false } = {}) => {
      const id = nextId++;
      const toast = { id, message, type, at: new Date().toISOString() };

      setToasts((list) => [...list, toast]);
      if (persist) setFeed((list) => [toast, ...list].slice(0, 30));

      const timer = setTimeout(() => dismiss(id), ttl);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  // Clear any pending timers when the provider goes away.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  // Realtime events arrive on the per-user socket room and surface as toasts.
  useEffect(() => {
    if (!user) return undefined;

    const unsubscribers = [
      on('swap:new', ({ swap }) =>
        notify(`${swap.requester?.name || 'Someone'} wants to swap ${swap.skillRequested}`, {
          type: 'info',
          persist: true,
        })
      ),
      on('swap:accepted', ({ swap }) =>
        notify(`${swap.provider?.name || 'Your match'} accepted the ${swap.skillRequested} swap`, {
          type: 'success',
          persist: true,
        })
      ),
      on('swap:declined', ({ swap }) =>
        notify(`Your ${swap.skillRequested} request was declined`, { type: 'warning', persist: true })
      ),
      on('swap:completed', async () => {
        notify('Swap completed. Credits settled.', { type: 'success', persist: true });
        await refreshUser();
      }),
      on('swap:cancelled', ({ swap }) =>
        notify(`The ${swap.skillRequested} swap was cancelled`, { type: 'warning', persist: true })
      ),
      on('review:new', ({ trustScore }) => {
        notify(`You received a new review. Trust score: ${trustScore}`, { type: 'success', persist: true });
        refreshUser();
      }),
      on('challenge:completed', ({ title, rewardCredits }) => {
        notify(`Challenge complete: ${title} (+${rewardCredits} credits)`, {
          type: 'success',
          persist: true,
        });
        refreshUser();
      }),
      on('message:notification', ({ from, preview }) =>
        notify(`${from}: ${preview}`, { type: 'info', persist: true })
      ),
    ];

    return () => unsubscribers.forEach((off) => off());
  }, [user, notify, refreshUser]);

  const value = useMemo(
    () => ({ toasts, feed, notify, dismiss, clearFeed: () => setFeed([]) }),
    [toasts, feed, notify, dismiss]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside a NotificationProvider');
  return ctx;
}
