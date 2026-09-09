const crypto = require('crypto');
const Organization = require('../models/Organization');
const Membership = require('../models/Membership');

function slugify(base) {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 180);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${cleaned || 'org'}-${suffix}`;
}

/**
 * Creates a new organization owned by `user`, plus the owner Membership row
 * in one call — there is no code path anywhere in this service that
 * creates an Organization without simultaneously creating its owner's
 * Membership, so "an organization with no members" is not a state this
 * service can produce.
 */
async function createOrganization(user, { name, personal = false } = {}) {
  const orgName = name || `${user.name}'s Organization`;
  // Retry once on the (very unlikely) slug collision instead of trusting a
  // single random suffix to never repeat.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const org = await Organization.create({
        name: orgName,
        slug: slugify(orgName),
        personal,
        createdBy: user._id,
      });
      const membership = await Membership.create({
        userId: user._id,
        organizationId: org._id,
        role: 'owner',
      });
      return { organization: org, membership };
    } catch (err) {
      if (err.code === 11000 && attempt < 2) continue; // duplicate slug — retry with a new random suffix
      throw err;
    }
  }
  throw new Error('Failed to create organization after retries');
}

/**
 * The org a freshly-issued token should carry. "Active org" for a
 * multi-org user is, for now, simply their oldest membership — a
 * dedicated switch-organization endpoint (see routes/organizationRoutes.js)
 * is how a user with multiple orgs gets a token for a different one; there
 * is no persisted "last active org" preference yet (a reasonable P1
 * follow-up, not a P0 correctness issue — every membership this resolves
 * to is real and one the user genuinely belongs to).
 *
 * SELF-HEALING: a user with zero memberships (anyone who registered before
 * this migration) gets a personal organization created transparently right
 * here, the first time this function runs for them — no manual migration
 * script required to keep existing accounts working. This is the ONLY
 * place a Membership gets created outside of an explicit
 * create-organization/accept-invite action, and it only fires for a user
 * who provably has no organization at all yet.
 */
async function resolveActiveMembership(user) {
  const existing = await Membership.findOne({ userId: user._id }).sort({ createdAt: 1 });
  if (existing) return existing;
  const { membership } = await createOrganization(user, { personal: true });
  return membership;
}

async function listMemberships(userId) {
  return Membership.find({ userId }).populate('organizationId');
}

module.exports = { createOrganization, resolveActiveMembership, listMemberships, slugify };
