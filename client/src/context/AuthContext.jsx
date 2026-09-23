import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { endpoints, setToken, clearToken, getToken, setUnauthorizedHandler } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearToken();
    disconnectSocket();
    setUser(null);
  }, []);

  // A 401 from any request means the stored token is dead: drop it once here.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      disconnectSocket();
      setUser(null);
    });
  }, []);

  // Restore the session on a hard refresh.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await endpoints.auth.me();
        if (!cancelled) {
          setUser(data.user);
          connectSocket();
        }
      } catch {
        clearToken();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const { data } = await endpoints.auth.login(credentials);
    setToken(data.token);
    setUser(data.user);
    connectSocket();
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await endpoints.auth.register(payload);
    setToken(data.token);
    setUser(data.user);
    connectSocket();
    return data.user;
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const { data } = await endpoints.auth.updateMe(payload);
    setUser(data.user);
    return data.user;
  }, []);

  /** Refresh the cached user after a swap or review moved the wallet/trust. */
  const refreshUser = useCallback(async () => {
    try {
      const { data } = await endpoints.auth.me();
      setUser(data.user);
      return data.user;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateProfile, refreshUser }),
    [user, loading, login, register, logout, updateProfile, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
