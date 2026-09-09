const { body } = require('express-validator');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const Membership = require('../models/Membership');
const { signAccessToken, signRefreshToken, verifyToken, hashToken } = require('../utils/jwt');
const { createOrganization, resolveActiveMembership, listMemberships } = require('../services/organizationService');
const env = require('../config/env');
const logger = require('../config/logger');

const REFRESH_COOKIE = 'refresh_token';
const ACCESS_COOKIE = 'access_token';

function cookieOptions(maxAgeMs) {
  const isProd = env.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: isProd ? env.cookie.secure : false,
    sameSite: isProd ? env.cookie.sameSite : 'lax',
    domain: env.cookie.domain || undefined,
    maxAge: maxAgeMs,
    path: '/',
  };
}

function msFromExpiry(expiresIn) {
  // supports "15m" / "7d" style strings used by jsonwebtoken
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  if (!match) return 15 * 60 * 1000;
  const value = Number(match[1]);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  return value * unit;
}

// membership is REQUIRED — every access/refresh token this service issues
// carries an org claim, no exceptions. See resolveActiveMembership's
// docstring for how a membership always exists by the time this is called.
async function issueTokenPair(user, membership, req, res) {
  const membershipClaim = { organizationId: membership.organizationId.toString(), role: membership.role };
  const accessToken = signAccessToken(user.toSafeObject(), membershipClaim);
  const refreshToken = signRefreshToken(user.toSafeObject(), user.tokenVersion, membershipClaim);

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + msFromExpiry(env.jwt.refreshExpiresIn)),
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(msFromExpiry(env.jwt.accessExpiresIn)));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(msFromExpiry(env.jwt.refreshExpiresIn)));
  return { accessToken, refreshToken };
}

const registerValidators = [
  body('name').trim().isLength({ min: 1, max: 120 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: { message: 'Email already registered', code: 'EMAIL_TAKEN', requestId: req.id } });
    }
    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ name, email, passwordHash });
    // Every user gets a real organization the moment they exist — a
    // "company of one" is still a real tenant boundary with the same
    // isolation guarantees as a deliberately-created multi-user org, not
    // a special unscoped case.
    const { membership } = await createOrganization(user, { personal: true });
    const { accessToken } = await issueTokenPair(user, membership, req, res);
    logger.info({ userId: user.id, organizationId: membership.organizationId.toString() }, 'user registered');
    return res.status(201).json({ user: user.toSafeObject(), accessToken });
  } catch (err) {
    return next(err);
  }
}

const loginValidators = [body('email').isEmail().normalizeEmail(), body('password').notEmpty()];

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS', requestId: req.id } });
    }
    const membership = await resolveActiveMembership(user);
    const { accessToken } = await issueTokenPair(user, membership, req, res);
    return res.status(200).json({ user: user.toSafeObject(), accessToken });
  } catch (err) {
    return next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
    if (!token) {
      return res.status(401).json({ error: { message: 'Missing refresh token', code: 'NO_REFRESH_TOKEN', requestId: req.id } });
    }
    const payload = verifyToken(token);
    if (payload.type !== 'refresh') throw new Error('Wrong token type');

    const stored = await RefreshToken.findOne({ tokenHash: hashToken(token), revoked: false });
    if (!stored) {
      return res.status(401).json({ error: { message: 'Refresh token revoked or unknown', code: 'REFRESH_REVOKED', requestId: req.id } });
    }
    const user = await User.findById(payload.sub);
    if (!user || user.tokenVersion !== payload.tv) {
      return res.status(401).json({ error: { message: 'Refresh token no longer valid', code: 'REFRESH_STALE', requestId: req.id } });
    }

    // Re-verify membership still exists (not just re-trust the org claim
    // baked into the old refresh token) — if the user was removed from
    // that org between issuances, this re-resolves to whatever org they
    // still legitimately belong to instead of re-issuing access to one
    // they no longer have.
    let membership = await Membership.findOne({ userId: user._id, organizationId: payload.org });
    if (!membership) {
      membership = await resolveActiveMembership(user);
    }

    // rotate: revoke old, issue new
    stored.revoked = true;
    await stored.save();
    const { accessToken } = await issueTokenPair(user, membership, req, res);
    return res.status(200).json({ user: user.toSafeObject(), accessToken });
  } catch (err) {
    return res.status(401).json({ error: { message: 'Invalid or expired refresh token', code: 'INVALID_REFRESH', requestId: req.id } });
  }
}

async function logout(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await RefreshToken.findOneAndUpdate({ tokenHash: hashToken(token) }, { revoked: true });
    }
    res.clearCookie(ACCESS_COOKIE, cookieOptions(0));
    res.clearCookie(REFRESH_COOKIE, cookieOptions(0));
    return res.status(200).json({ message: 'Logged out' });
  } catch (err) {
    return next(err);
  }
}

async function logoutAll(req, res, next) {
  try {
    await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });
    await RefreshToken.updateMany({ userId: req.user.id }, { revoked: true });
    res.clearCookie(ACCESS_COOKIE, cookieOptions(0));
    res.clearCookie(REFRESH_COOKIE, cookieOptions(0));
    return res.status(200).json({ message: 'Logged out on all devices' });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND', requestId: req.id } });
    return res.status(200).json({ user: user.toSafeObject(), organizationId: req.user.orgId, orgRole: req.user.orgRole });
  } catch (err) {
    return next(err);
  }
}

// Lets other services (or the frontend) sanity-check a token against this service directly.
// NOT required for normal request flow — main/AI services verify locally with the public key.
async function verify(req, res) {
  const token = req.body?.token || req.cookies?.[ACCESS_COOKIE];
  try {
    const payload = verifyToken(token);
    return res.status(200).json({ valid: true, payload });
  } catch (err) {
    return res.status(200).json({ valid: false, reason: err.message });
  }
}

// ---------------------------------------------------------------------------
// Organization endpoints — the surface a user actually manages tenancy
// through. Kept in this controller (not a separate one) since every one of
// these is really a variant of "issue tokens for this user under a
// different/new organization", the same job issueTokenPair already does.
// ---------------------------------------------------------------------------

const createOrganizationValidators = [body('name').trim().isLength({ min: 1, max: 200 })];

async function createOrganizationHandler(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    const { organization, membership } = await createOrganization(user, { name: req.body.name, personal: false });
    logger.info({ userId: user.id, organizationId: organization.id }, 'organization created');
    return res.status(201).json({ organization: organization.toSafeObject(), role: membership.role });
  } catch (err) {
    return next(err);
  }
}

async function listOrganizationsHandler(req, res, next) {
  try {
    const memberships = await listMemberships(req.user.id);
    return res.status(200).json({
      organizations: memberships
        .filter((m) => m.organizationId) // guard against a dangling membership row if an org doc was ever hard-deleted
        .map((m) => ({ ...m.organizationId.toSafeObject(), role: m.role, active: m.organizationId.id === req.user.orgId })),
    });
  } catch (err) {
    return next(err);
  }
}

// Issues a FRESH token pair scoped to a different organization the caller
// already belongs to. Does not create a membership — that's
// createOrganizationHandler (for a brand new org) or a future
// accept-invite endpoint (for joining an existing one); this only switches
// which of the caller's EXISTING memberships their token reflects.
async function switchOrganizationHandler(req, res, next) {
  try {
    const membership = await Membership.findOne({ userId: req.user.id, organizationId: req.params.organizationId });
    if (!membership) {
      return res.status(403).json({ error: { message: 'Not a member of this organization', code: 'NOT_A_MEMBER', requestId: req.id } });
    }
    const user = await User.findById(req.user.id);
    const { accessToken } = await issueTokenPair(user, membership, req, res);
    return res.status(200).json({ user: user.toSafeObject(), accessToken });
  } catch (err) {
    return next(err);
  }
}

const inviteMemberValidators = [
  body('email').isEmail().normalizeEmail(),
  body('role').optional().isIn(Membership.ROLES),
];

// Adds an EXISTING user (by email) to the caller's active organization.
// Restricted to admin/owner by the requireOrgRole('admin') middleware on
// this route (see routes/organizationRoutes.js) — enforcing that check in
// middleware rather than here keeps the role-gate visible at the route
// definition instead of buried in a conditional partway down a handler.
async function inviteMemberHandler(req, res, next) {
  try {
    const invitee = await User.findOne({ email: req.body.email });
    if (!invitee) {
      return res.status(404).json({ error: { message: 'No user with that email exists yet', code: 'USER_NOT_FOUND', requestId: req.id } });
    }
    const role = req.body.role || 'member';
    try {
      const membership = await Membership.create({ userId: invitee._id, organizationId: req.user.orgId, role });
      return res.status(201).json({ userId: invitee.id, role: membership.role });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: { message: 'Already a member of this organization', code: 'ALREADY_MEMBER', requestId: req.id } });
      }
      throw err;
    }
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  registerValidators,
  loginValidators,
  createOrganizationValidators,
  inviteMemberValidators,
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
  verify,
  createOrganizationHandler,
  listOrganizationsHandler,
  switchOrganizationHandler,
  inviteMemberHandler,
};
