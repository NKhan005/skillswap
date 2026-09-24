'use strict';

/**
 * Development seed: a small Hyderabad-centred community whose skills overlap,
 * so the matching, nearby, wallet and trust features all have something to
 * show on first run.
 *
 *   npm run seed            (adds to whatever is there)
 *   npm run seed -- --fresh (drops the collections first)
 */

const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const SwapRequest = require('../models/SwapRequest');
const Review = require('../models/Review');
const Transaction = require('../models/Transaction');
const Message = require('../models/Message');
const Challenge = require('../models/Challenge');
const { recalculateTrustScore } = require('../utils/trustScore');
const logger = require('../utils/logger');

const PASSWORD = 'password123';

// Coordinates are [lng, lat] around Hyderabad, a few km apart so the
// 1/5/10/20 km radius filters produce visibly different results.
const PEOPLE = [
  {
    name: 'Gowthami R',
    email: 'gowthami@skillswap.dev',
    city: 'Hyderabad',
    bio: 'Full-stack developer who loves teaching React and learning guitar.',
    coordinates: [78.4867, 17.385],
    experienceLevel: 'advanced',
    skillsOffered: [
      { name: 'React', category: 'Technology', experienceLevel: 'advanced', yearsOfExperience: 4 },
      { name: 'Node.js', category: 'Technology', experienceLevel: 'advanced', yearsOfExperience: 3 },
    ],
    skillsNeeded: [
      { name: 'Guitar', category: 'Music', urgency: 'high' },
      { name: 'Photography', category: 'Design', urgency: 'medium' },
    ],
    verification: {
      githubUrl: 'https://github.com/gowthami',
      leetcodeUrl: 'https://leetcode.com/gowthami',
      portfolioUrl: 'https://gowthami.dev',
    },
  },
  {
    name: 'Arjun Mehta',
    email: 'arjun@skillswap.dev',
    city: 'Hyderabad',
    bio: 'Session guitarist. Want to move into product design.',
    coordinates: [78.4905, 17.3905], // ~0.8 km from Gowthami
    experienceLevel: 'expert',
    skillsOffered: [
      { name: 'Guitar', category: 'Music', experienceLevel: 'expert', yearsOfExperience: 9 },
      { name: 'Music Theory', category: 'Music', experienceLevel: 'advanced', yearsOfExperience: 6 },
    ],
    skillsNeeded: [
      { name: 'React', category: 'Technology', urgency: 'high' },
      { name: 'Figma', category: 'Design', urgency: 'low' },
    ],
  },
  {
    name: 'Priya Nair',
    email: 'priya@skillswap.dev',
    city: 'Hyderabad',
    bio: 'Product designer. Teaching Figma, learning backend engineering.',
    coordinates: [78.5200, 17.4100], // ~4 km
    experienceLevel: 'advanced',
    skillsOffered: [
      { name: 'Figma', category: 'Design', experienceLevel: 'expert', yearsOfExperience: 5 },
      { name: 'UI Design', category: 'Design', experienceLevel: 'advanced', yearsOfExperience: 5 },
    ],
    skillsNeeded: [
      { name: 'Node.js', category: 'Technology', urgency: 'high' },
      { name: 'Spanish', category: 'Languages', urgency: 'low' },
    ],
  },
  {
    name: 'Daniel Okafor',
    email: 'daniel@skillswap.dev',
    city: 'Hyderabad',
    bio: 'Photographer and videographer, curious about data.',
    coordinates: [78.5600, 17.4400], // ~9 km
    experienceLevel: 'intermediate',
    skillsOffered: [
      { name: 'Photography', category: 'Design', experienceLevel: 'advanced', yearsOfExperience: 7 },
      { name: 'Video Editing', category: 'Design', experienceLevel: 'intermediate', yearsOfExperience: 3 },
    ],
    skillsNeeded: [
      { name: 'Python', category: 'Technology', urgency: 'medium' },
      { name: 'React', category: 'Technology', urgency: 'low' },
    ],
  },
  {
    name: 'Meera Kapoor',
    email: 'meera@skillswap.dev',
    city: 'Secunderabad',
    bio: 'Data scientist. Teaching Python, learning to cook properly.',
    coordinates: [78.6100, 17.5000], // ~18 km
    experienceLevel: 'expert',
    skillsOffered: [
      { name: 'Python', category: 'Technology', experienceLevel: 'expert', yearsOfExperience: 8 },
      { name: 'Machine Learning', category: 'Technology', experienceLevel: 'advanced', yearsOfExperience: 5 },
    ],
    skillsNeeded: [
      { name: 'Cooking', category: 'Cooking', urgency: 'medium' },
      { name: 'Guitar', category: 'Music', urgency: 'low' },
    ],
  },
  {
    name: 'Sanjay Verma',
    email: 'sanjay@skillswap.dev',
    city: 'Hyderabad',
    bio: 'Chef running weekend classes. Want to build a website for my kitchen.',
    coordinates: [78.4700, 17.3700], // ~2.5 km
    experienceLevel: 'expert',
    skillsOffered: [
      { name: 'Cooking', category: 'Cooking', experienceLevel: 'expert', yearsOfExperience: 12 },
      { name: 'Baking', category: 'Cooking', experienceLevel: 'advanced', yearsOfExperience: 8 },
    ],
    skillsNeeded: [
      { name: 'React', category: 'Technology', urgency: 'high' },
      { name: 'Photography', category: 'Design', urgency: 'medium' },
    ],
  },
  {
    name: 'Laura Diaz',
    email: 'laura@skillswap.dev',
    city: 'Hyderabad',
    bio: 'Spanish teacher, learning design and machine learning.',
    coordinates: [78.4950, 17.3800], // ~1.2 km
    experienceLevel: 'advanced',
    skillsOffered: [
      { name: 'Spanish', category: 'Languages', experienceLevel: 'expert', yearsOfExperience: 10 },
      { name: 'English', category: 'Languages', experienceLevel: 'advanced', yearsOfExperience: 10 },
    ],
    skillsNeeded: [
      { name: 'UI Design', category: 'Design', urgency: 'medium' },
      { name: 'Machine Learning', category: 'Technology', urgency: 'low' },
    ],
  },
];

const CHALLENGES = [
  {
    title: 'Teach 5 people',
    description: 'Complete swaps where you are the one teaching, with 5 different members.',
    metric: 'people_taught',
    target: 5,
    rewardCredits: 10,
  },
  {
    title: 'First 3 swaps',
    description: 'Finish your first three exchanges on SkillSwap.',
    metric: 'completed_swaps',
    target: 3,
    rewardCredits: 5,
  },
  {
    title: 'Community favourite',
    description: 'Collect 10 reviews from the people you have swapped with.',
    metric: 'reviews_received',
    target: 10,
    rewardCredits: 15,
  },
  {
    title: 'Ten hours given',
    description: 'Teach a total of ten hours.',
    metric: 'hours_taught',
    target: 10,
    rewardCredits: 20,
  },
];

/** The history of completed swaps: [requester, provider, learns, teaches, type, hours]. */
const SWAP_HISTORY = [
  ['gowthami@skillswap.dev', 'arjun@skillswap.dev', 'Guitar', 'React', 'direct', 2],
  ['arjun@skillswap.dev', 'priya@skillswap.dev', 'Figma', 'Music Theory', 'direct', 1.5],
  ['priya@skillswap.dev', 'gowthami@skillswap.dev', 'Node.js', 'UI Design', 'direct', 2],
  ['daniel@skillswap.dev', 'meera@skillswap.dev', 'Python', 'Photography', 'direct', 3],
  ['sanjay@skillswap.dev', 'gowthami@skillswap.dev', 'React', '', 'credit', 2],
  ['laura@skillswap.dev', 'priya@skillswap.dev', 'UI Design', 'Spanish', 'direct', 1],
  ['meera@skillswap.dev', 'sanjay@skillswap.dev', 'Cooking', 'Machine Learning', 'direct', 2],
];

/** Wipe every collection, for a `--fresh` run. */
async function dropCollections() {
  logger.info('Dropping existing collections');
  await Promise.all([
    User.deleteMany({}),
    SwapRequest.deleteMany({}),
    Review.deleteMany({}),
    Transaction.deleteMany({}),
    Message.deleteMany({}),
    Challenge.deleteMany({}),
  ]);
}

/** Create one member, plus the ledger row for their signup bonus. */
async function createMember(person) {
  const user = new User({
    ...person,
    password: PASSWORD,
    location: { type: 'Point', coordinates: person.coordinates },
  });
  await user.save();

  await Transaction.create({
    user: user._id,
    type: 'signup_bonus',
    amount: user.wallet.balance,
    balanceAfter: user.wallet.balance,
    description: 'Welcome bonus credits',
  });

  return user;
}

/** The demo community. Members that already exist are left alone. */
async function seedMembers() {
  const users = [];
  for (const person of PEOPLE) {
    const existing = await User.findOne({ email: person.email });
    users.push(existing || (await createMember(person)));
  }
  logger.info(`Members ready: ${users.length}`);
  return users;
}

/** Settle a credit swap through the same ledger the API uses. */
async function settleCreditSwap(swap, requester, provider, hours, skillRequested) {
  const { transferCredits } = require('../utils/wallet');
  await transferCredits({
    fromUserId: requester._id,
    toUserId: provider._id,
    amount: hours,
    swapId: swap._id,
    skill: skillRequested,
  });
}

/** A short exchange plus both reviews, so trust scores have something to read. */
async function addConversationAndReviews(swap, requester, provider, skillRequested, skillOffered) {
  await Message.create([
    {
      swap: swap._id,
      sender: requester._id,
      recipient: provider._id,
      body: `Hi! Could we do the ${skillRequested} session this weekend?`,
    },
    {
      swap: swap._id,
      sender: provider._id,
      recipient: requester._id,
      body: 'Sounds good. Saturday at 11 works for me.',
    },
  ]);

  // The Review post-save hook recalculates the reviewee's trust score.
  await Review.create({
    swap: swap._id,
    reviewer: requester._id,
    reviewee: provider._id,
    rating: 5,
    comment: `Excellent ${skillRequested} mentor - clear and patient.`,
    skillTaught: skillRequested,
    tags: ['patient', 'knowledgeable'],
  });
  await Review.create({
    swap: swap._id,
    reviewer: provider._id,
    reviewee: requester._id,
    rating: 4,
    comment: 'Great session, well prepared.',
    skillTaught: skillOffered || '',
    tags: ['well-prepared', 'punctual'],
  });
}

/** One completed swap from the history table. False when it already exists. */
async function seedCompletedSwap(byEmail, entry) {
  const [requesterEmail, providerEmail, skillRequested, skillOffered, type, hours] = entry;
  const requester = byEmail[requesterEmail];
  const provider = byEmail[providerEmail];
  if (!requester || !provider) return false;

  const exists = await SwapRequest.findOne({
    requester: requester._id,
    provider: provider._id,
    skillRequested,
  });
  if (exists) return false;

  const swap = await SwapRequest.create({
    requester: requester._id,
    provider: provider._id,
    type,
    skillRequested,
    skillOffered: type === 'direct' ? skillOffered : undefined,
    hours,
    creditCost: type === 'credit' ? hours : 0,
    status: 'completed',
    requesterConfirmed: true,
    providerConfirmed: true,
    respondedAt: new Date(Date.now() - 6 * 864e5),
    completedAt: new Date(Date.now() - 3 * 864e5),
    meetingLocation: 'Cafe Coffee Day, Banjara Hills',
    message: `Looking forward to learning ${skillRequested}.`,
  });

  if (type === 'credit') {
    await settleCreditSwap(swap, requester, provider, hours, skillRequested);
  }
  await addConversationAndReviews(swap, requester, provider, skillRequested, skillOffered);

  return true;
}

/** Replay the whole history table. */
async function seedHistory(byEmail) {
  let created = 0;
  for (const entry of SWAP_HISTORY) {
    if (await seedCompletedSwap(byEmail, entry)) created += 1;
  }
  logger.info(`Completed swaps seeded: ${created}`);
}

/** One open request, so the inbox is not empty on first login. */
async function seedPendingRequest(byEmail) {
  if (await SwapRequest.findOne({ status: 'pending' })) return;

  const swap = await SwapRequest.create({
    requester: byEmail['daniel@skillswap.dev']._id,
    provider: byEmail['gowthami@skillswap.dev']._id,
    type: 'direct',
    skillRequested: 'React',
    skillOffered: 'Photography',
    hours: 2,
    message: 'Happy to trade a portrait session for React basics.',
  });

  await Message.create({
    swap: swap._id,
    sender: swap.requester,
    recipient: swap.provider,
    body: 'Hi Gowthami! Interested in swapping photography for React?',
  });
}

/** The community challenges, with the first few members already joined. */
async function seedChallenges(users) {
  for (const c of CHALLENGES) {
    if (await Challenge.findOne({ title: c.title })) continue;
    await Challenge.create({
      ...c,
      participants: users.slice(0, 4).map((u) => ({ user: u._id })),
    });
  }
  logger.info(`Challenges ready: ${await Challenge.countDocuments()}`);
}

/**
 * Settle the consequences of the seeded history. These swaps were written
 * straight to the database rather than through the API, so nothing has
 * recomputed trust or evaluated the challenges they satisfy - without this a
 * member can sit at 100% progress and never be paid.
 */
async function settleDerivedState(users) {
  const { evaluateChallenges } = require('../controllers/challengeController');

  for (const user of users) {
    await recalculateTrustScore(user._id);
  }

  let rewarded = 0;
  for (const user of users) {
    rewarded += (await evaluateChallenges(user._id)).length;
  }
  logger.info(`Challenge rewards paid out: ${rewarded}`);
}

/** Print the login table. */
async function printSummary() {
  const summary = await User.find()
    .select('name email trustScore wallet.balance')
    .sort({ trustScore: -1 })
    .lean();

  logger.info(`--- Seeded members (password: ${PASSWORD}) ---`);
  for (const u of summary) {
    logger.info(
      `  ${u.name.padEnd(16)} ${u.email.padEnd(28)} trust ${String(u.trustScore).padStart(3)}  ${u.wallet.balance} credits`
    );
  }
}

async function run() {
  await connectDB();

  if (process.argv.includes('--fresh')) await dropCollections();

  const users = await seedMembers();
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));

  await seedHistory(byEmail);
  await seedPendingRequest(byEmail);
  await seedChallenges(users);
  await settleDerivedState(users);
  await printSummary();

  await disconnectDB();
  logger.info('Seed complete');
}

run().catch(async (err) => {
  logger.error(`Seed failed: ${err.message}`);
  logger.error(err.stack);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
