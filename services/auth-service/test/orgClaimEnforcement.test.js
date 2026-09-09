const test = require('node:test');
const assert = require('node:assert');
const { generateKeyPairSync } = require('node:crypto');
const jwt = require('jsonwebtoken');

const env = require('../src/config/env');
const { requireAuth } = require('../src/middleware/auth');

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

function signRaw(privateKey, claims) {
  return jwt.sign({ type: 'access', ...claims }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '15m',
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
    keyid: 'test-key',
  });
}

function mockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function withSwappedKey(publicKey, fn) {
  const original = { publicKey: env.jwt.publicKey, previousPublicKey: env.jwt.previousPublicKey };
  env.jwt.publicKey = publicKey;
  env.jwt.previousPublicKey = undefined;
  try {
    return fn();
  } finally {
    env.jwt.publicKey = original.publicKey;
    env.jwt.previousPublicKey = original.previousPublicKey;
  }
}

test('requireAuth rejects a token with no org claim (pre-migration/forged) rather than admitting it', () => {
  const { privateKey, publicKey } = keyPair();
  withSwappedKey(publicKey, () => {
    const token = signRaw(privateKey, { sub: 'user-1', role: 'user' }); // no `org` claim
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    let nextCalled = false;
    requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error.code, 'STALE_TOKEN_NO_ORG');
  });
});

test('requireAuth admits a token with an org claim and populates req.user.orgId/orgRole', () => {
  const { privateKey, publicKey } = keyPair();
  withSwappedKey(publicKey, () => {
    const token = signRaw(privateKey, { sub: 'user-1', role: 'user', org: 'org-123', orgRole: 'owner' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    let nextCalled = false;
    requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.user.orgId, 'org-123');
    assert.strictEqual(req.user.orgRole, 'owner');
  });
});

test('requireAuth still rejects a refresh-typed token even with an org claim (wrong token type)', () => {
  const { privateKey, publicKey } = keyPair();
  withSwappedKey(publicKey, () => {
    const token = jwt.sign({ sub: 'user-1', type: 'refresh', org: 'org-123' }, privateKey, {
      algorithm: 'RS256', expiresIn: '15m', issuer: env.jwt.issuer, audience: env.jwt.audience, keyid: 'test-key',
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    let nextCalled = false;
    requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
  });
});
