'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMatch, skillSets, scoreMatch, normalize } = require('../src/utils/matching');

const gowthami = {
  _id: 'a1',
  name: 'Gowthami',
  trustScore: 80,
  skillsOffered: [{ name: 'React' }, { name: 'Node.js' }],
  skillsNeeded: [{ name: 'Guitar' }, { name: 'Photography' }],
};

const arjun = {
  _id: 'b2',
  name: 'Arjun',
  trustScore: 70,
  skillsOffered: [{ name: '  guitar ' }], // messy casing and spacing on purpose
  skillsNeeded: [{ name: 'REACT' }],
};

const daniel = {
  _id: 'c3',
  name: 'Daniel',
  trustScore: 60,
  skillsOffered: [{ name: 'Photography' }],
  skillsNeeded: [{ name: 'Python' }], // nothing Gowthami offers
};

const stranger = {
  _id: 'd4',
  name: 'Stranger',
  trustScore: 90,
  skillsOffered: [{ name: 'Welding' }],
  skillsNeeded: [{ name: 'Pottery' }],
};

test('skill names normalise across casing and stray whitespace', () => {
  assert.equal(normalize('  React   JS '), 'react js');
  assert.equal(normalize('REACT'), 'react');
});

test('a two-way overlap is reported as a mutual match', () => {
  const match = buildMatch(skillSets(gowthami), arjun);
  assert.equal(match.matchType, 'mutual');
  assert.deepEqual(match.theyTeachMe, ['guitar']);
  assert.deepEqual(match.iTeachThem, ['react']);
});

test('a one-way overlap is kept but marked one-way', () => {
  const match = buildMatch(skillSets(gowthami), daniel);
  assert.equal(match.matchType, 'one-way');
  assert.deepEqual(match.theyTeachMe, ['photography']);
  assert.deepEqual(match.iTeachThem, []);
});

test('no overlap at all produces no match', () => {
  assert.equal(buildMatch(skillSets(gowthami), stranger), null);
});

test('mutual matches always outrank one-way ones', () => {
  const mutual = buildMatch(skillSets(gowthami), arjun);
  const oneWay = buildMatch(skillSets(gowthami), daniel);
  assert.ok(mutual.matchScore > oneWay.matchScore);
});

test('closer members rank above distant ones, all else equal', () => {
  const near = scoreMatch({ theyTeachMe: ['x'], iTeachThem: ['y'], candidate: arjun, distanceKm: 1 });
  const far = scoreMatch({ theyTeachMe: ['x'], iTeachThem: ['y'], candidate: arjun, distanceKm: 20 });
  assert.ok(near > far);
});

test('a match never leaks the candidate password or email', () => {
  const match = buildMatch(skillSets(gowthami), {
    ...arjun,
    password: 'hashed-secret',
    email: 'arjun@example.com',
  });
  assert.equal(match.user.password, undefined);
  assert.equal(match.user.email, undefined);
});
