'use strict';

/**
 * Socket.io layer against a real server and real clients: handshake auth,
 * room authorisation, message fan-out and persistence.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'socket_test_secret';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { io: ioClient } = require('socket.io-client');
const request = require('supertest');

let mongod;
let server;
let baseUrl;
let app;

const state = {};
const sockets = [];

/**
 * Connect a client and resolve once the handshake succeeds. The server emits
 * `connected` inside its connection handler, which can land before a caller
 * gets the chance to subscribe, so it is captured here and parked on the
 * socket as `hello`.
 */
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });
    sockets.push(socket);
    socket.on('connected', (payload) => {
      socket.hello = payload;
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

/** Wait for the parked `connected` payload to arrive. */
async function hello(socket, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!socket.hello) {
    if (Date.now() > deadline) throw new Error('timed out waiting for "connected"');
    await new Promise((r) => setTimeout(r, 20));
  }
  return socket.hello;
}

/** Resolve on the next occurrence of `event`, or reject after `ms`. */
function once(socket, event, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('skillswap_socket_test');
  await mongoose.connect(process.env.MONGO_URI);
  await require('../src/models/User').syncIndexes();

  app = require('../src/app')();
  server = http.createServer(app);
  require('../src/sockets').initSocketServer(server);

  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Two members with an accepted swap between them, plus an outsider.
  const register = async (name, email, offered, needed) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name,
        email,
        password: 'password123',
        skillsOffered: offered,
        skillsNeeded: needed,
      })
      .expect(201);
    return { token: res.body.token, id: res.body.user.id };
  };

  state.alice = await register('Alice', 'alice@socket.dev', [{ name: 'React' }], [{ name: 'Guitar' }]);
  state.bob = await register('Bob', 'bob@socket.dev', [{ name: 'Guitar' }], [{ name: 'React' }]);
  state.eve = await register('Eve', 'eve@socket.dev', [{ name: 'Welding' }], [{ name: 'Pottery' }]);

  const swap = await request(app)
    .post('/api/swaps')
    .set('Authorization', `Bearer ${state.alice.token}`)
    .send({ providerId: state.bob.id, skillRequested: 'Guitar', skillOffered: 'React' })
    .expect(201);

  state.swapId = swap.body.swap._id;
});

test.after(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongod.stop();
});

test('a socket without a token is rejected at the handshake', async () => {
  await assert.rejects(() => connect(undefined), /Authentication token missing|missing/i);
});

test('a socket with a forged token is rejected', async () => {
  await assert.rejects(() => connect('not-a-real-jwt'), /authentication failed|jwt/i);
});

test('a valid token connects and lands in its own user room', async () => {
  const socket = await connect(state.alice.token);
  const payload = await hello(socket);
  assert.equal(payload.userId, state.alice.id);
});

test('joining a swap room returns the thread history', async () => {
  const socket = await connect(state.alice.token);
  const ack = await new Promise((resolve) => socket.emit('join_room', { swapId: state.swapId }, resolve));

  assert.equal(ack.ok, true);
  assert.equal(ack.room, `swap:${state.swapId}`);
});

test('a member outside the swap cannot join its room', async () => {
  const socket = await connect(state.eve.token);
  const ack = await new Promise((resolve) => socket.emit('join_room', { swapId: state.swapId }, resolve));

  assert.equal(ack.ok, false);
  assert.match(ack.error, /not part of this swap/i);
});

test('a message sent by one side reaches the other in the room', async () => {
  const alice = await connect(state.alice.token);
  const bob = await connect(state.bob.token);

  await new Promise((r) => alice.emit('join_room', { swapId: state.swapId }, r));
  await new Promise((r) => bob.emit('join_room', { swapId: state.swapId }, r));

  const received = once(bob, 'receive_message');
  alice.emit('send_message', { swapId: state.swapId, body: 'Saturday at 11 works' });

  const msg = await received;
  assert.equal(msg.body, 'Saturday at 11 works');
  assert.equal(String(msg.sender._id), state.alice.id);
});

test('a delivered message is persisted and readable over REST', async () => {
  const alice = await connect(state.alice.token);
  await new Promise((r) => alice.emit('join_room', { swapId: state.swapId }, r));

  await new Promise((resolve) =>
    alice.emit('send_message', { swapId: state.swapId, body: 'Bringing my laptop' }, resolve)
  );

  const thread = await request(app)
    .get(`/api/messages/${state.swapId}`)
    .set('Authorization', `Bearer ${state.bob.token}`)
    .expect(200);

  assert.ok(thread.body.messages.some((m) => m.body === 'Bringing my laptop'));
});

test('an outsider cannot post into a room they never joined', async () => {
  const eve = await connect(state.eve.token);
  const ack = await new Promise((resolve) =>
    eve.emit('send_message', { swapId: state.swapId, body: 'let me in' }, resolve)
  );

  assert.equal(ack.ok, false);

  const thread = await request(app)
    .get(`/api/messages/${state.swapId}`)
    .set('Authorization', `Bearer ${state.alice.token}`)
    .expect(200);

  assert.ok(!thread.body.messages.some((m) => m.body === 'let me in'));
});

test('an empty message is refused', async () => {
  const alice = await connect(state.alice.token);
  const ack = await new Promise((resolve) =>
    alice.emit('send_message', { swapId: state.swapId, body: '   ' }, resolve)
  );
  assert.equal(ack.ok, false);
});

test('accepting a swap notifies the requester on their user channel', async () => {
  const alice = await connect(state.alice.token);
  const notified = once(alice, 'swap:accepted');

  await request(app)
    .patch(`/api/swaps/${state.swapId}/accept`)
    .set('Authorization', `Bearer ${state.bob.token}`)
    .expect(200);

  const payload = await notified;
  assert.equal(payload.swap.status, 'accepted');
});
