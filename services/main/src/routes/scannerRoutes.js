const express = require('express');
const ctrl = require('../controllers/scannerController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { strictLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(requireAuth, strictLimiter);

router.post('/scan', ctrl.triggerScanValidators, validate, ctrl.triggerScan);
router.get('/status/:scanId', ctrl.scanStatusValidators, validate, ctrl.getScanStatus);
router.post('/approve-fix', ctrl.approveFixValidators, validate, ctrl.approveAndFix);
router.get('/history', ctrl.getScanHistory);

module.exports = router;

