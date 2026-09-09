const mongoose = require('mongoose');

// The tenant boundary. Every Membership, and (downstream, in main-service
// and ai-storage-service) every scan/asset/risk-assessment/telemetry/audit
// record, is scoped to an organizationId — not merely a userId. See
// Membership.js for the user<->organization link and role.
//
// `personal` distinguishes an auto-created single-owner organization
// (created transparently at registration so existing single-user flows
// keep working with zero manual setup) from one a user deliberately
// created via POST /organizations. Both are real organizations with the
// same isolation guarantees — this flag is informational (e.g. so the
// frontend can label it "Personal" instead of asking for a company name),
// never a different code path for authorization.
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 220 },
    personal: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

organizationSchema.methods.toSafeObject = function toSafeObject() {
  return { id: this._id.toString(), name: this.name, slug: this.slug, personal: this.personal };
};

module.exports = mongoose.model('Organization', organizationSchema);
