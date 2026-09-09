const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Verifies the JWT LOCALLY using the auth-service's public key.
// No network call to auth-service happens here — this keeps main-service
// functional even if auth-service is temporarily down, and keeps latency low.
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.access_token) return req.cookies.access_token;
  return null;
}

// Verifies against the current public key first, then falls back to the
// previous one if configured (see config/env.js) — so a key rotation on
// auth-service doesn't instantly invalidate every token this service is
// independently verifying locally, only the ones that outlive the handover
// window.
function verifyLocal(token) {
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
      throw currentKeyErr;
    }
  }
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: { message: 'Missing access token', code: 'NO_TOKEN', requestId: req.id } });
  }
  try {
    const payload = verifyLocal(token);
    if (payload.type !== 'access') throw new Error('wrong token type');
    // Same enforcement as auth-service's own middleware — a token with no
    // org claim is pre-migration (or forged) and gets rejected here too,
    // not silently trusted just because this service verifies locally.
    // Every downstream Mongo query keyed by organizationId depends on this
    // never being undefined once req.user exists.
    if (!payload.org) {
      return res.status(401).json({ error: { message: 'Token missing organization claim — please log in again', code: 'STALE_TOKEN_NO_ORG', requestId: req.id } });
    }
    req.user = { id: payload.sub, role: payload.role, orgId: payload.org, orgRole: payload.orgRole };
    req.accessToken = token; // handy if we need to forward it downstream
    return next();
  } catch (err) {
    return res.status(401).json({ error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN', requestId: req.id } });
  }
}

// Optional auth: attaches req.user if a valid token is present, but never blocks the request.
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyLocal(token);
    if (payload.org) {
      req.user = { id: payload.sub, role: payload.role, orgId: payload.org, orgRole: payload.orgRole };
    }
    // A payload with no org claim on an OPTIONAL-auth route is treated the
    // same as no token at all (req.user left unset) rather than a hard
    // 401 — optional routes are, by definition, ones that already have a
    // no-auth fallback path, and a stale token shouldn't be worse than no
    // token there.
  } catch {
    // ignore invalid token for optional routes
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN', requestId: req.id } });
    }
    return next();
  };
}

module.exports = { requireAuth, optionalAuth, requireRole, extractToken, verifyLocal };
