const Membership = require('../models/Membership');

// authenticated -> org membership -> ROLE/PERMISSION -> resource ownership
// -> operation. This is that third link. Must run after requireAuth (needs
// req.user.orgId already set).
function requireOrgRole(minimumRole) {
  return (req, res, next) => {
    if (!req.user || !req.user.orgRole) {
      return res.status(401).json({ error: { message: 'Not authenticated', code: 'NO_AUTH', requestId: req.id } });
    }
    if (!Membership.roleAtLeast(req.user.orgRole, minimumRole)) {
      return res.status(403).json({
        error: {
          message: `Requires '${minimumRole}' role or higher in this organization`,
          code: 'INSUFFICIENT_ORG_ROLE',
          requestId: req.id,
        },
      });
    }
    return next();
  };
}

module.exports = { requireOrgRole };
