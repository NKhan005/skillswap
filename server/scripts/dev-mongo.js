'use strict';

/**
 * A throwaway MongoDB for local development, for machines without Docker or a
 * system-wide mongod. It downloads a real MongoDB binary on first run and
 * serves it on a fixed port so `MONGO_URI=mongodb://127.0.0.1:27018/skillswap`
 * behaves exactly like a normal server.
 *
 *   npm run mongo:dev            (ephemeral - data is dropped on exit)
 *   npm run mongo:dev -- --keep  (persist into .devdata/)
 *
 * Never use this in production: docker-compose or Atlas provides the real one.
 */

const path = require('node:path');
const fs = require('node:fs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PORT = parseInt(process.env.DEV_MONGO_PORT || '27018', 10);
const keep = process.argv.includes('--keep');
const dbPath = path.join(__dirname, '..', '.devdata');

async function main() {
  if (keep && !fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

  const mongod = await MongoMemoryServer.create({
    instance: {
      port: PORT,
      dbName: 'skillswap',
      ...(keep ? { dbPath, storageEngine: 'wiredTiger' } : {}),
    },
  });

  const uri = mongod.getUri('skillswap');
  console.log('');
  console.log('  Dev MongoDB is up.');
  console.log(`  URI: ${uri}`);
  console.log(`  Put this in server/.env:  MONGO_URI=mongodb://127.0.0.1:${PORT}/skillswap`);
  console.log(keep ? `  Data persists in ${dbPath}` : '  Data is dropped when this process exits.');
  console.log('  Ctrl+C to stop.');
  console.log('');

  const stop = async () => {
    console.log('\nStopping dev MongoDB');
    await mongod.stop();
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(`Could not start dev MongoDB: ${err.message}`);
  process.exit(1);
});
