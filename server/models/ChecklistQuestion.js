const mongoose = require('mongoose');

const checklistQuestionSchema = new mongoose.Schema(
  {
    stage: { type: mongoose.Schema.Types.ObjectId, ref: 'Stage', required: true },
    text: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChecklistQuestion', checklistQuestionSchema);
