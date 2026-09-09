const test = require('node:test');
const assert = require('node:assert');

const { requireOrgRole } = require('../src/middleware/orgAuth');

function mockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('requireOrgRole allows a request whose orgRole meets the minimum', () => {
  const req = { user: { orgRole: 'admin' } };
  const res = mockRes();
  let nextCalled = false;
  requireOrgRole('member')(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, null);
});

test('requireOrgRole rejects a request whose orgRole is below the minimum', () => {
  const req = { user: { orgRole: 'member' } };
  const res = mockRes();
  let nextCalled = false;
  requireOrgRole('admin')(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.error.code, 'INSUFFICIENT_ORG_ROLE');
});

test('requireOrgRole rejects when req.user is entirely absent', () => {
  const req = {};
  const res = mockRes();
  let nextCalled = false;
  requireOrgRole('member')(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('requireOrgRole rejects when req.user has no orgRole set', () => {
  const req = { user: { id: 'u1' } };
  const res = mockRes();
  let nextCalled = false;
  requireOrgRole('member')(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
});

test('requireOrgRole("owner") only admits an actual owner', () => {
  const res1 = mockRes();
  let admitted = false;
  requireOrgRole('owner')({ user: { orgRole: 'admin' } }, res1, () => { admitted = true; });
  assert.strictEqual(admitted, false);

  const res2 = mockRes();
  let admittedOwner = false;
  requireOrgRole('owner')({ user: { orgRole: 'owner' } }, res2, () => { admittedOwner = true; });
  assert.strictEqual(admittedOwner, true);
});
