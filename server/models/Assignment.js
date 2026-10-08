const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.Mixed, default: () => new mongoose.Types.ObjectId().toString() },
    auditor: { type: mongoose.Schema.Types.Mixed, ref: 'User', required: true },
    atm: { type: mongoose.Schema.Types.Mixed, ref: 'Atm', required: true },
  },
  { timestamps: true }
);

assignmentSchema.index({ auditor: 1, atm: 1 }, { unique: true });

module.exports = mongoose.model('Assignment', assignmentSchema);
