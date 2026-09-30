const mongoose = require('mongoose');

const auditDraftSchema = new mongoose.Schema(
  {
    auditor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    atmId: { type: String, default: '', index: true },
    selectedAtm: { type: mongoose.Schema.Types.Mixed, default: null },
    photos: [{ type: String }],
    stages: { type: Array, default: [] },
    stageIndex: { type: Number, default: 0 },
    started: { type: Boolean, default: false },
    existingAuditId: { type: String, default: null },
    continuingAudit: { type: Boolean, default: false },
    lastDevice: { type: String, default: '' },
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

auditDraftSchema.index({ auditor: 1, updatedAt: -1 });

module.exports = mongoose.model('AuditDraft', auditDraftSchema);
