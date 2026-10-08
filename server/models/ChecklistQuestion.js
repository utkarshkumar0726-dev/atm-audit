const mongoose = require('mongoose');

const checklistQuestionSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.Mixed, default: () => new mongoose.Types.ObjectId().toString() },
    stage: { type: mongoose.Schema.Types.Mixed, ref: 'Stage', required: true },
    text: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChecklistQuestion', checklistQuestionSchema);
