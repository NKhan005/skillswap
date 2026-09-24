'use strict';

require('dotenv').config();

const required = (key, fallback) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

/**
 * Turn a CLIENT_ORIGIN value into a list of origins CORS can match.
 *
 * A bare hostname gains https://, since that is what a hosted platform hands
 * over and what the browser will actually send. A value that already carries
 * a scheme is left alone, so localhost keeps http:// in development.
 */
function normaliseOrigins(raw) {
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((origin) => (/^https?:\/\//i.test(origin) ? origin : `https://${origin}`))
    .map((origin) => origin.replace(/\/+$/, ''));
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGO_URI: required('MONGO_URI', 'mongodb://127.0.0.1:27017/skillswap'),
  JWT_SECRET: required('JWT_SECRET', 'skillswap_dev_secret_change_me'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  // Accepts a comma-separated list, and tolerates a bare hostname. Render's
  // `fromService: property: host` yields "skillswap-hryf" with no scheme,
  // which would never match the Origin header a browser sends and would have
  // Socket.io refusing its own page's handshake.
  CLIENT_ORIGIN: normaliseOrigins(process.env.CLIENT_ORIGIN || 'http://localhost:5173'),
  // Public DNS resolvers keep mongodb+srv:// lookups from hanging behind
  // captive/corporate resolvers that drop SRV records (querySrv ETIMEOUT).
  DNS_SERVERS: (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Time-credit economics
  CREDITS_PER_HOUR: parseFloat(process.env.CREDITS_PER_HOUR || '1'),
  SIGNUP_BONUS_CREDITS: parseFloat(process.env.SIGNUP_BONUS_CREDITS || '3'),
};

module.exports = env;
