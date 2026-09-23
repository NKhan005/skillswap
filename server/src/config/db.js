'use strict';

const dns = require('node:dns');
const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

/**
 * Point Node's resolver at public DNS before Mongoose touches a
 * mongodb+srv:// URI. Atlas connection strings resolve through SRV + TXT
 * records, and the default system resolver on many networks silently drops
 * them, surfacing as `querySrv ETIMEOUT` / `ESERVFAIL` after 30s.
 */
function applyPublicDnsResolvers() {
  try {
    dns.setServers(env.DNS_SERVERS);
    // Atlas hosts publish both A and AAAA; prefer whatever answers first.
    dns.setDefaultResultOrder('ipv4first');
    logger.info(`DNS resolvers set to ${env.DNS_SERVERS.join(', ')}`);
  } catch (err) {
    logger.warn(`Could not override DNS resolvers: ${err.message}`);
  }
}

async function connectDB(uri = env.MONGO_URI) {
  applyPublicDnsResolvers();

  mongoose.set('strictQuery', true);

  const options = {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    family: 4,
    maxPoolSize: 20,
    retryWrites: true,
  };

  try {
    const conn = await mongoose.connect(uri, options);
    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
    mongoose.connection.on('error', (err) => logger.error(`MongoDB error: ${err.message}`));

    return conn;
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    throw err;
  }
}

async function disconnectDB() {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
}

module.exports = { connectDB, disconnectDB };
