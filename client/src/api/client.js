import axios from 'axios';

const TOKEN_KEY = 'skillswap.token';

/**
 * Empty baseURL means same-origin: the Vite dev proxy in development and the
 * Nginx reverse proxy in the container both forward /api to the server, so no
 * build-time host is baked into the bundle.
 */
const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * A hosted API on a free tier sleeps when idle and can take the better part
 * of a minute to wake, so the first request after a quiet spell needs room.
 * Same-origin means the dev proxy or the Nginx container, which is local and
 * should fail fast instead.
 */
const DEFAULT_TIMEOUT = API_URL ? 60000 : 20000;

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: Number(import.meta.env.VITE_API_TIMEOUT) || DEFAULT_TIMEOUT,
});

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Callback the auth provider registers so a dead session logs the user out
// once, centrally, instead of every screen handling its own 401.
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const message =
      error.response?.data?.message ||
      (error.code === 'ECONNABORTED' ? 'The server took too long to respond' : null) ||
      (!error.response ? 'Cannot reach the server' : 'Something went wrong');

    if (status === 401 && onUnauthorized) onUnauthorized();

    return Promise.reject(
      Object.assign(new Error(message), {
        status,
        details: error.response?.data?.details,
      })
    );
  }
);

/** Endpoint map - one place to see the whole API surface. */
export const endpoints = {
  auth: {
    register: (data) => api.post('/api/auth/register', data),
    login: (data) => api.post('/api/auth/login', data),
    me: () => api.get('/api/auth/me'),
    updateMe: (data) => api.put('/api/auth/me', data),
    profile: (id) => api.get(`/api/auth/users/${id}`),
  },
  matching: {
    direct: (params) => api.get('/api/matching', { params }),
    nearby: (params) => api.get('/api/matching/nearby', { params }),
    explore: (params) => api.get('/api/matching/explore', { params }),
    skills: () => api.get('/api/matching/skills'),
  },
  swaps: {
    list: (params) => api.get('/api/swaps', { params }),
    get: (id) => api.get(`/api/swaps/${id}`),
    create: (data) => api.post('/api/swaps', data),
    accept: (id, data) => api.patch(`/api/swaps/${id}/accept`, data || {}),
    decline: (id, data) => api.patch(`/api/swaps/${id}/decline`, data || {}),
    complete: (id) => api.patch(`/api/swaps/${id}/complete`, {}),
    cancel: (id, data) => api.patch(`/api/swaps/${id}/cancel`, data || {}),
  },
  reviews: {
    create: (data) => api.post('/api/reviews', data),
    forUser: (userId) => api.get(`/api/reviews/user/${userId}`),
    pending: () => api.get('/api/reviews/pending'),
    trust: (userId) => api.get(`/api/reviews/trust/${userId}`),
  },
  wallet: {
    get: (params) => api.get('/api/wallet', { params }),
    ledger: (params) => api.get('/api/wallet/ledger', { params }),
    stats: () => api.get('/api/wallet/stats'),
  },
  messages: {
    conversations: () => api.get('/api/messages'),
    thread: (swapId) => api.get(`/api/messages/${swapId}`),
    send: (swapId, body) => api.post(`/api/messages/${swapId}`, { body }),
  },
  challenges: {
    list: () => api.get('/api/challenges'),
    join: (id) => api.post(`/api/challenges/${id}/join`),
    create: (data) => api.post('/api/challenges', data),
    leaderboard: () => api.get('/api/challenges/leaderboard'),
  },
  health: () => api.get('/api/health'),
};

export default api;
