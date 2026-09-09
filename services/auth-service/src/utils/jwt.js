const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

function signAccessToken(user, membership) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      // org/orgRole are REQUIRED on every access token from this point on
      // — see middleware/auth.js in main-service and core/security.py in
      // ai-storage-service, both of which now reject a token missing
      // these claims rather than silently treating an absent org as "no
      // isolation needed". A caller with no organization membership
      // cannot be issued a valid access token (see authController.js —
      // registration and login both guarantee a membership exists first).
      org: membership.organizationId,
      orgRole: membership.role,
      type: 'access',
    },
    env.jwt.privateKey,
    {
      algorithm: 'RS256',
      expiresIn: env.jwt.accessExpiresIn,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      keyid: env.jwt.kid,
    }
  );
}

function signRefreshToken(user, tokenVersion, membership) {
  return jwt.sign(
    { sub: user.id, type: 'refresh', tv: tokenVersion, org: membership.organizationId },
    env.jwt.privateKey,
    {
      algorithm: 'RS256',
      expiresIn: env.jwt.refreshExpiresIn,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      keyid: env.jwt.kid,
    }
  );
}

// Verifies against the current public key first, then falls back to the
// previous one (if configured — see config/env.js) so tokens signed just
// before a key rotation don't get rejected mid-flight. Rotating JWT_KID
// invalidates every outstanding token immediately without this: the whole
// point of the dual-key window is that rotation stops being an
// everyone-logs-out event.
function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwt.publicKey, {
      algorithms: ['RS256'],
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    });
  } catch (currentKeyErr) {
    if (!env.jwt.previousPublicKey) throw currentKeyErr;
    try {
      return jwt.verify(token, env.jwt.previousPublicKey, {
        algorithms: ['RS256'],
        issuer: env.jwt.issuer,
        audience: env.jwt.audience,
      });
    } catch {
      // Neither key verified it — surface the current-key error, since that's
      // the one that matters once the previous key is eventually retired.
      throw currentKeyErr;
    }
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, signRefreshToken, verifyToken, hashToken };
