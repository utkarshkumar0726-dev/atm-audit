const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema(
  {
    atmId: { type: String, required: true },
    area: { type: String, required: true },
    auditor: { type: mongoose.Schema.Types.Mixed, ref: 'User', required: true },
    photos: [{ type: String }],
    stages: { type: Array, default: [] },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    status: { type: String, default: 'in_progress', enum: ['in_progress', 'completed'] },
  },
  { timestamps: true, strict: false }
);

auditSchema.index({ atmId: 1 });
auditSchema.index({ auditor: 1 });
auditSchema.index({ isCompleted: 1 });

module.exports = mongoose.model('Audit', auditSchema);
