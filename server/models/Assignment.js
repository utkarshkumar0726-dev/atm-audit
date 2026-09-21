const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    auditor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    atm: { type: mongoose.Schema.Types.ObjectId, ref: 'Atm', required: true },
  },
  { timestamps: true }
);

assignmentSchema.index({ auditor: 1, atm: 1 }, { unique: true });

module.exports = mongoose.model('Assignment', assignmentSchema);
