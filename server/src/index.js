'use strict';

const http = require('node:http');

const env = require('./config/env');
const createApp = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const { initSocketServer } = require('./sockets');
const logger = require('./utils/logger');

async function bootstrap() {
  await connectDB();

  const app = createApp();
  // Socket.io and Express share one HTTP server so both answer on PORT.
  const server = http.createServer(app);

  initSocketServer(server);

  server.listen(env.PORT, () => {
    logger.info(`SkillSwap API listening on :${env.PORT} (${env.NODE_ENV})`);
    logger.info(`CORS origins: ${env.CLIENT_ORIGIN.join(', ')}`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (require.main === module) {
  bootstrap().catch((err) => {
    logger.error(`Startup failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = bootstrap;
