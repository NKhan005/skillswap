'use strict';

/**
 * End-to-end pass over the whole platform against a real MongoDB (an
 * in-memory server, so geospatial indexes and the aggregation pipeline behave
 * exactly as they do in production).
 *
 * The flow mirrors a real session: two members register, the matching engine
 * pairs them, they run a credit swap, the wallet settles, reviews move the
 * trust score, and a challenge pays out.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'integration_test_secret';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

let mongod;
let app;

// Hyderabad-ish coordinates a known distance apart.
const GOWTHAMI_COORDS = [78.4867, 17.385];
const ARJUN_COORDS = [78.4905, 17.3905]; // ~0.8 km away
const FAR_COORDS = [72.8777, 19.076]; // Mumbai, ~620 km away

const api = () => request(app);

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('skillswap_test');

  await mongoose.connect(process.env.MONGO_URI);
  // 2dsphere and the unique email index must exist before the geo queries run.
  await Promise.all([
    require('../src/models/User').syncIndexes(),
    require('../src/models/Review').syncIndexes(),
  ]);

  app = require('../src/app')();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

/** Shared state across the ordered steps below. */
const state = {};

test('a member can register and receives a token plus signup credits', async () => {
  const res = await api()
    .post('/api/auth/register')
    .send({
      name: 'Gowthami R',
      email: 'gowthami@test.dev',
      password: 'password123',
      city: 'Hyderabad',
      coordinates: GOWTHAMI_COORDS,
      skillsOffered: [{ name: 'React', category: 'Technology', experienceLevel: 'advanced' }],
      skillsNeeded: [{ name: 'Guitar', category: 'Music' }],
    })
    .expect(201);

  assert.ok(res.body.token, 'expected a JWT');
  assert.equal(res.body.user.email, 'gowthami@test.dev');
  assert.equal(res.body.user.wallet.balance, 3, 'signup bonus should be credited');
  assert.equal(res.body.user.password, undefined, 'password must never be returned');

  state.gowthami = { token: res.body.token, id: res.body.user.id };
});

test('the same email cannot register twice', async () => {
  const res = await api()
    .post('/api/auth/register')
    .send({ name: 'Copycat', email: 'gowthami@test.dev', password: 'password123' })
    .expect(409);

  assert.match(res.body.message, /already registered/i);
});

test('an oversized email is rejected quickly, before pattern matching', async () => {
  // The email matcher's cost grows with input length, so an unbounded string
  // is a denial-of-service vector. The length check runs first and bails.
  const huge = `${'a'.repeat(100_000)}@example.com`;

  const started = Date.now();
  const res = await api().post('/api/auth/register').send({
    name: 'Too Long',
    email: huge,
    password: 'password123',
  });
  const elapsed = Date.now() - started;

  assert.equal(res.status, 400);
  assert.match(JSON.stringify(res.body.details || {}), /too long/i);
  assert.ok(elapsed < 2000, `rejection should be immediate, took ${elapsed}ms`);
});

test('a short password is rejected with a field-level message', async () => {
  const res = await api()
    .post('/api/auth/register')
    .send({ name: 'Weak', email: 'weak@test.dev', password: 'short' })
    .expect(400);

  assert.equal(res.body.success, false);
  assert.ok(res.body.details.password);
});

test('a second member registers as the mirror match', async () => {
  const res = await api()
    .post('/api/auth/register')
    .send({
      name: 'Arjun Mehta',
      email: 'arjun@test.dev',
      password: 'password123',
      city: 'Hyderabad',
      coordinates: ARJUN_COORDS,
      skillsOffered: [{ name: 'Guitar', category: 'Music', experienceLevel: 'expert' }],
      skillsNeeded: [{ name: 'React', category: 'Technology' }],
    })
    .expect(201);

  state.arjun = { token: res.body.token, id: res.body.user.id };
});

test('a distant member registers to prove the radius filter bites', async () => {
  const res = await api()
    .post('/api/auth/register')
    .send({
      name: 'Far Away',
      email: 'far@test.dev',
      password: 'password123',
      city: 'Mumbai',
      coordinates: FAR_COORDS,
      skillsOffered: [{ name: 'Guitar', category: 'Music' }],
      skillsNeeded: [{ name: 'React', category: 'Technology' }],
    })
    .expect(201);

  state.far = { token: res.body.token, id: res.body.user.id };
});

test('login rejects a wrong password without revealing whether the email exists', async () => {
  const res = await api()
    .post('/api/auth/login')
    .send({ email: 'gowthami@test.dev', password: 'wrongpassword' })
    .expect(401);

  assert.match(res.body.message, /invalid email or password/i);
});

test('protected routes refuse an anonymous caller', async () => {
  await api().get('/api/auth/me').expect(401);
  await api().get('/api/swaps').expect(401);
});

test('smart matching finds the mutual pair in both directions', async () => {
  const res = await api()
    .get('/api/matching')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .expect(200);

  const arjun = res.body.matches.find((m) => m.user._id === state.arjun.id);
  assert.ok(arjun, 'Arjun should be matched with Gowthami');
  assert.equal(arjun.matchType, 'mutual');
  assert.deepEqual(arjun.theyTeachMe, ['guitar']);
  assert.deepEqual(arjun.iTeachThem, ['react']);
  assert.equal(arjun.user.password, undefined);
});

test('nearby search honours the radius', async () => {
  const near = await api()
    .get('/api/matching/nearby?radius=5')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .expect(200);

  const ids = near.body.matches.map((m) => m.user._id);
  assert.ok(ids.includes(state.arjun.id), 'Arjun is 0.8 km away and should be inside 5 km');
  assert.ok(!ids.includes(state.far.id), 'Mumbai is 600+ km away and must be excluded');

  const arjun = near.body.matches.find((m) => m.user._id === state.arjun.id);
  assert.ok(arjun.distanceKm < 2, `expected under 2 km, got ${arjun.distanceKm}`);

  // Widen the radius and the distant member appears.
  const wide = await api()
    .get('/api/matching/nearby?radius=1000')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .expect(200);

  assert.ok(wide.body.matches.map((m) => m.user._id).includes(state.far.id));
});

test('a swap cannot request a skill the provider does not teach', async () => {
  const res = await api()
    .post('/api/swaps')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .send({ providerId: state.arjun.id, skillRequested: 'Welding', skillOffered: 'React' })
    .expect(400);

  assert.match(res.body.message, /does not list/i);
});

test('a member cannot swap with themselves', async () => {
  await api()
    .post('/api/swaps')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .send({ providerId: state.gowthami.id, skillRequested: 'React' })
    .expect(400);
});

test('a credit swap is created and priced from the hours', async () => {
  const res = await api()
    .post('/api/swaps')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .send({
      providerId: state.arjun.id,
      skillRequested: 'Guitar',
      type: 'credit',
      hours: 2,
      message: 'Two hours of guitar please',
    })
    .expect(201);

  assert.equal(res.body.swap.status, 'pending');
  assert.equal(res.body.swap.creditCost, 2);
  state.swapId = res.body.swap._id;
});

test('a duplicate open request for the same skill is refused', async () => {
  await api()
    .post('/api/swaps')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .send({ providerId: state.arjun.id, skillRequested: 'Guitar', type: 'credit', hours: 1 })
    .expect(409);
});

test('only the provider can accept a request', async () => {
  await api()
    .patch(`/api/swaps/${state.swapId}/accept`)
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .expect(403);

  const res = await api()
    .patch(`/api/swaps/${state.swapId}/accept`)
    .set('Authorization', `Bearer ${state.arjun.token}`)
    .send({ meetingLocation: 'Cafe on MG Road' })
    .expect(200);

  assert.equal(res.body.swap.status, 'accepted');
});

test('completion needs both confirmations before credits move', async () => {
  const first = await api()
    .patch(`/api/swaps/${state.swapId}/complete`)
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .expect(200);

  assert.equal(first.body.swap.status, 'accepted', 'one confirmation must not settle the swap');
  assert.equal(first.body.awaitingConfirmationFrom, 'provider');

  // Wallets are untouched so far.
  const mid = await api()
    .get('/api/wallet')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .expect(200);
  assert.equal(mid.body.wallet.balance, 3);

  const second = await api()
    .patch(`/api/swaps/${state.swapId}/complete`)
    .set('Authorization', `Bearer ${state.arjun.token}`)
    .expect(200);

  assert.equal(second.body.swap.status, 'completed');
  assert.equal(second.body.creditsTransferred, 2);
});

test('the wallet ledger reflects the settled swap on both sides', async () => {
  const payer = await api()
    .get('/api/wallet')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .expect(200);

  assert.equal(payer.body.wallet.balance, 1, '3 signup credits - 2 spent');
  assert.equal(payer.body.wallet.totalSpent, 2);

  const spent = payer.body.wallet.transactions.find((t) => t.type === 'spent');
  assert.ok(spent, 'a spend row should exist');
  assert.equal(spent.balanceAfter, 1);

  const earner = await api()
    .get('/api/wallet')
    .set('Authorization', `Bearer ${state.arjun.token}`)
    .expect(200);

  assert.equal(earner.body.wallet.balance, 5, '3 signup credits + 2 earned');
  assert.equal(earner.body.wallet.totalEarned, 5);
});

test('a spend larger than the balance is refused and leaves the wallet intact', async () => {
  const { postTransaction } = require('../src/utils/wallet');

  await assert.rejects(
    () => postTransaction({ userId: state.gowthami.id, type: 'spent', amount: 999 }),
    /insufficient/i
  );

  const after = await api()
    .get('/api/wallet')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .expect(200);

  assert.equal(after.body.wallet.balance, 1, 'the failed debit must not change the balance');
});

test('ledger rows are immutable', async () => {
  const Transaction = require('../src/models/Transaction');
  const row = await Transaction.findOne({ user: state.gowthami.id });

  await assert.rejects(
    () => Transaction.updateOne({ _id: row._id }, { $set: { amount: 1000 } }),
    /immutable/i
  );
});

test('a review moves the reviewee trust score off zero', async () => {
  const before = await api()
    .get(`/api/auth/users/${state.arjun.id}`)
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .expect(200);

  const res = await api()
    .post('/api/reviews')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .send({ swapId: state.swapId, rating: 5, comment: 'Excellent guitar mentor', tags: ['patient'] })
    .expect(201);

  assert.equal(res.body.review.rating, 5);
  assert.ok(
    res.body.reviewee.trustScore > before.body.user.trustScore,
    `trust should rise: ${before.body.user.trustScore} -> ${res.body.reviewee.trustScore}`
  );
  assert.equal(res.body.reviewee.trustStats.completedSwaps, 1);
});

test('the same swap cannot be reviewed twice by the same member', async () => {
  await api()
    .post('/api/reviews')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .send({ swapId: state.swapId, rating: 4 })
    .expect(409);
});

test('a swap that was not completed cannot be reviewed', async () => {
  const fresh = await api()
    .post('/api/swaps')
    .set('Authorization', `Bearer ${state.arjun.token}`)
    .send({ providerId: state.gowthami.id, skillRequested: 'React', skillOffered: 'Guitar' })
    .expect(201);

  await api()
    .post('/api/reviews')
    .set('Authorization', `Bearer ${state.arjun.token}`)
    .send({ swapId: fresh.body.swap._id, rating: 5 })
    .expect(400);
});

test('the trust breakdown adds up to the published score', async () => {
  const res = await api()
    .get(`/api/reviews/trust/${state.arjun.id}`)
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .expect(200);

  const { breakdown, trustScore } = res.body;
  const summed = breakdown.reviews + breakdown.swaps + breakdown.response;
  assert.ok(Math.abs(summed - trustScore) <= 1, `${summed} vs ${trustScore}`);
});

test('chat messages persist and are readable only by the participants', async () => {
  await api()
    .post(`/api/messages/${state.swapId}`)
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .send({ body: 'See you Saturday at 11' })
    .expect(201);

  const thread = await api()
    .get(`/api/messages/${state.swapId}`)
    .set('Authorization', `Bearer ${state.arjun.token}`)
    .expect(200);

  assert.ok(thread.body.messages.some((m) => m.body === 'See you Saturday at 11'));

  // An outsider is refused.
  await api()
    .get(`/api/messages/${state.swapId}`)
    .set('Authorization', `Bearer ${state.far.token}`)
    .expect(403);
});

test('a challenge pays out once its target is met', async () => {
  const created = await api()
    .post('/api/challenges')
    .set('Authorization', `Bearer ${state.arjun.token}`)
    .send({ title: 'First swap', metric: 'completed_swaps', target: 1, rewardCredits: 10 })
    .expect(201);

  const balanceBefore = (
    await api().get('/api/wallet').set('Authorization', `Bearer ${state.arjun.token}`)
  ).body.wallet.balance;

  // Arjun already has one completed swap, so joining settles it immediately.
  const joined = await api()
    .post(`/api/challenges/${created.body.challenge._id}/join`)
    .set('Authorization', `Bearer ${state.arjun.token}`)
    .expect(201);

  assert.equal(joined.body.completed.length, 1);
  assert.equal(joined.body.completed[0].rewardCredits, 10);

  const after = await api().get('/api/wallet').set('Authorization', `Bearer ${state.arjun.token}`);
  assert.equal(after.body.wallet.balance, balanceBefore + 10);

  // Re-evaluating must not pay twice.
  const { evaluateChallenges } = require('../src/controllers/challengeController');
  const again = await evaluateChallenges(state.arjun.id);
  assert.equal(again.length, 0, 'a completed challenge must not pay out again');

  const final = await api().get('/api/wallet').set('Authorization', `Bearer ${state.arjun.token}`);
  assert.equal(final.body.wallet.balance, balanceBefore + 10);
});

test('profile updates merge verification links without dropping certifications', async () => {
  await api()
    .put('/api/auth/me')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .send({
      verification: {
        githubUrl: 'https://github.com/gowthami',
        certifications: [{ title: 'AWS Solutions Architect', issuer: 'Amazon' }],
      },
    })
    .expect(200);

  // A later partial update touches only one link.
  const res = await api()
    .put('/api/auth/me')
    .set('Authorization', `Bearer ${state.gowthami.token}`)
    .send({ verification: { leetcodeUrl: 'https://leetcode.com/gowthami' } })
    .expect(200);

  assert.equal(res.body.user.verification.githubUrl, 'https://github.com/gowthami');
  assert.equal(res.body.user.verification.certifications.length, 1);
  assert.equal(res.body.user.verification.isVerified, true);
});

test('the health endpoint reports a connected database', async () => {
  const res = await api().get('/api/health').expect(200);
  assert.equal(res.body.database, 'connected');
  assert.equal(res.body.service, 'skillswap-api');
});

test('an unknown route returns a JSON 404', async () => {
  const res = await api().get('/api/nope').expect(404);
  assert.equal(res.body.success, false);
});
