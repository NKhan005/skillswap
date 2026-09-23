'use strict';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const active = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const stamp = () => new Date().toISOString();

const emit = (level, stream, msg) => {
  if (LEVELS[level] > active) return;
  stream(`${stamp()} [${level.toUpperCase()}] ${msg}`);
};

module.exports = {
  error: (msg) => emit('error', console.error, msg),
  warn: (msg) => emit('warn', console.warn, msg),
  info: (msg) => emit('info', console.log, msg),
  debug: (msg) => emit('debug', console.log, msg),
};
