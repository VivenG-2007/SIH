const { verifyToken } = require('../utils/jwt');

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.access_token) return req.cookies.access_token;
  return null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: { message: 'Missing access token', code: 'NO_TOKEN', requestId: req.id } });
  }
  try {
    const payload = verifyToken(token);
    if (payload.type !== 'access') throw new Error('Wrong token type');
    // A token missing the org claim is a PRE-MIGRATION token (or forged) —
    // rejected outright rather than treated as "no isolation needed". A
    // fresh login always issues one with `org` set (see
    // organizationService.resolveActiveMembership), so this only ever
    // forces a genuinely-stale token to be refreshed/re-issued, never a
    // legitimate current session.
    if (!payload.org) {
      return res.status(401).json({ error: { message: 'Token missing organization claim — please log in again', code: 'STALE_TOKEN_NO_ORG', requestId: req.id } });
    }
    req.user = { id: payload.sub, role: payload.role, orgId: payload.org, orgRole: payload.orgRole };
    return next();
  } catch (err) {
    return res.status(401).json({ error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN', requestId: req.id } });
  }
}

module.exports = { requireAuth, extractToken };
