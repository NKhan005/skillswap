'use strict';

const fs = require('node:fs');
const path = require('node:path');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const env = require('./config/env');
const routes = require('./routes');
const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // Auth is the expensive, guessable surface; the rest of the API is cheap.
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 50,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: 'Too many attempts, please try again later' },
    })
  );
  app.use(
    '/api',
    rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false })
  );

  /** Liveness + DB readiness, used by Docker and Kubernetes probes. */
  app.get('/api/health', (_req, res) => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const dbState = states[mongoose.connection.readyState] || 'unknown';
    res.status(dbState === 'connected' ? 200 : 503).json({
      success: dbState === 'connected',
      service: 'skillswap-api',
      version: require('../package.json').version,
      env: env.NODE_ENV,
      database: dbState,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', routes);

  serveClientBuild(app);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

/**
 * Serve the built client from the API process, when a build is present.
 *
 * This is what makes a single-service deployment possible: the browser talks
 * to one origin, so there is no CORS to configure and Socket.io connects to
 * the same host that served the page. Locally the directory does not exist
 * (Vite's dev server handles the client), so this is skipped and the API
 * behaves exactly as before.
 */
function serveClientBuild(app) {
  const dist = process.env.CLIENT_DIST_PATH || path.join(__dirname, '..', '..', 'client', 'dist');

  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    // Say where it looked. Finding nothing is normal in development, where
    // Vite serves the client, but in a deployment it means the build step
    // did not run and the site will answer with JSON instead of the app.
    logger.warn(`No client build at ${dist}; serving the API only`);

    // Without a build, the root is the API's own banner rather than a 404.
    app.get('/', (_req, res) => {
      res.json({
        name: 'SkillSwap API',
        tagline: 'Exchange Skills, Not Money',
        health: '/api/health',
      });
    });
    return;
  }

  logger.info(`Serving the client build from ${dist}`);

  // Hashed filenames, so these can be cached hard. index.html must not be.
  app.use(
    express.static(dist, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  // Client-side routing: anything that is not the API or a real file is the
  // SPA shell. /api is excluded so a wrong endpoint still returns a JSON 404
  // rather than a page of HTML.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

module.exports = createApp;
