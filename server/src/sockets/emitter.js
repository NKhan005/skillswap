'use strict';

/**
 * Tiny registry so controllers can push realtime events without importing the
 * socket server (which would import the models, which import the controllers).
 * `setIO` is called once during bootstrap; before that every emit is a no-op,
 * which keeps controllers unit-testable with no socket server running.
 */

let io = null;

function setIO(instance) {
  io = instance;
}

function getIO() {
  return io;
}

/** Per-user notification channel - every socket joins `user:<id>` on connect. */
function emitToUser(userId, event, payload) {
  if (!io || !userId) return false;
  io.to(`user:${String(userId._id || userId)}`).emit(event, payload);
  return true;
}

/** Swap chat room - `swap:<swapId>`. */
function emitToRoom(room, event, payload) {
  if (!io || !room) return false;
  io.to(room).emit(event, payload);
  return true;
}

module.exports = { setIO, getIO, emitToUser, emitToRoom };
