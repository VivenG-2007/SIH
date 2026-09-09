const express = require('express');
const ctrl = require('../controllers/authController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireOrgRole } = require('../middleware/orgAuth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// -- Public --
router.post('/register', authLimiter, ctrl.registerValidators, validate, ctrl.register);
router.post('/login', authLimiter, ctrl.loginValidators, validate, ctrl.login);
router.post('/refresh', authLimiter, ctrl.refresh);
router.post('/verify', ctrl.verify); // optional remote-check helper, not on the hot path

// -- Authenticated --
router.post('/logout', ctrl.logout);
router.post('/logout-all', requireAuth, ctrl.logoutAll);
router.get('/me', requireAuth, ctrl.me);

// -- Organizations --
router.get('/organizations', requireAuth, ctrl.listOrganizationsHandler);
router.post('/organizations', requireAuth, ctrl.createOrganizationValidators, validate, ctrl.createOrganizationHandler);
router.post('/organizations/:organizationId/switch', requireAuth, ctrl.switchOrganizationHandler);
// admin-or-owner only — a plain member cannot add other members to the org.
router.post(
  '/organizations/members',
  requireAuth,
  requireOrgRole('admin'),
  ctrl.inviteMemberValidators,
  validate,
  ctrl.inviteMemberHandler
);

module.exports = router;
