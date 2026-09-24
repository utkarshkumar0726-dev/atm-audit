const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    audit: { type: mongoose.Schema.Types.ObjectId, ref: 'Audit' },
    auditor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    auditorName: { type: String, required: true },
    auditorUsername: { type: String, required: true },
    atmId: { type: String, required: true },
    area: { type: String, default: '' },
    action: { type: String, default: 'AUDIT_SUBMITTED' },
    photoCount: { type: Number, default: 0 },
    stageCount: { type: Number, default: 0 },
    ip: { type: String, default: '127.0.0.1' },
    userAgent: { type: String, default: '' },
    device: { type: String, default: 'Desktop' },
    browser: { type: String, default: 'Browser' },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ atmId: 1 });
auditLogSchema.index({ auditor: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
