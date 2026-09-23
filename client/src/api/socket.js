import { io } from 'socket.io-client';
import { getToken } from './client';

let socket = null;

/**
 * One shared socket for the whole session. Chat rooms and the per-user
 * notification channel multiplex over it, so navigating between screens does
 * not tear down and rebuild the connection.
 */
export function connectSocket() {
  if (socket?.connected) return socket;

  const token = getToken();
  if (!token) return null;

  socket = io(import.meta.env.VITE_SOCKET_URL || '/', {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/** Subscribe and get an unsubscribe back, so effects can clean up in one line. */
export function on(event, handler) {
  const s = connectSocket();
  if (!s) return () => {};
  s.on(event, handler);
  return () => s.off(event, handler);
}

export function emit(event, payload, ack) {
  const s = connectSocket();
  if (!s) return false;
  s.emit(event, payload, ack);
  return true;
}
