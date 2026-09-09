const test = require('node:test');
const assert = require('node:assert');

const Membership = require('../src/models/Membership');

test('roleAtLeast: owner satisfies every minimum', () => {
  assert.strictEqual(Membership.roleAtLeast('owner', 'member'), true);
  assert.strictEqual(Membership.roleAtLeast('owner', 'admin'), true);
  assert.strictEqual(Membership.roleAtLeast('owner', 'owner'), true);
});

test('roleAtLeast: member does not satisfy admin or owner', () => {
  assert.strictEqual(Membership.roleAtLeast('member', 'admin'), false);
  assert.strictEqual(Membership.roleAtLeast('member', 'owner'), false);
  assert.strictEqual(Membership.roleAtLeast('member', 'member'), true);
});

test('roleAtLeast: admin satisfies admin and member but not owner', () => {
  assert.strictEqual(Membership.roleAtLeast('admin', 'member'), true);
  assert.strictEqual(Membership.roleAtLeast('admin', 'admin'), true);
  assert.strictEqual(Membership.roleAtLeast('admin', 'owner'), false);
});

test('roleAtLeast: an unrecognized role never satisfies any minimum (fails closed)', () => {
  assert.strictEqual(Membership.roleAtLeast('bogus-role', 'member'), false);
});

test('ROLES export lists exactly the three ordinal roles', () => {
  assert.deepStrictEqual(Membership.ROLES, ['owner', 'admin', 'member']);
});
