const mongoose = require('mongoose');

// authenticated -> org membership -> role/permission -> resource ownership
// -> operation. This model is the second link in that chain — the first
// (authenticated) is the existing JWT verification; this is what used to
// be entirely missing.
//
// Role is ORG-SCOPED, not global — a user can be 'owner' of their personal
// org and 'member' of a colleague's org at the same time. This replaces
// User.role (still present, kept as a platform-level distinction — e.g. a
// future support/superadmin flag — but no longer what authorization
// decisions for organization resources are based on).
const MEMBERSHIP_ROLES = ['owner', 'admin', 'member'];

// Ordinal ranking so `hasAtLeastRole(role, 'admin')`-style checks are a
// single comparison instead of a hand-maintained if/else chain per call
// site — see requireOrgRole in middleware/orgAuth.js.
const ROLE_RANK = { member: 0, admin: 1, owner: 2 };

const membershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    role: { type: String, enum: MEMBERSHIP_ROLES, default: 'member', required: true },
  },
  { timestamps: true }
);

// A user has at most one role in a given organization — prevents
// duplicate/conflicting membership rows for the same (user, org) pair.
membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
// Reverse lookup: "which orgs is this user in" (used at login to resolve
// the default active org) and "who's in this org" (used by the invite/
// member-list endpoints) both need to be fast.
membershipSchema.index({ userId: 1 });
membershipSchema.index({ organizationId: 1 });

function roleAtLeast(role, minimum) {
  return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[minimum] ?? Infinity);
}

const Membership = mongoose.model('Membership', membershipSchema);
Membership.ROLES = MEMBERSHIP_ROLES;
Membership.roleAtLeast = roleAtLeast;

module.exports = Membership;
