const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema(
  {
    atmId: { type: String, required: true },
    area: { type: String, required: true },
    auditor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    photos: [{ type: String }],
    stages: { type: Array, default: [] },
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model('Audit', auditSchema);
