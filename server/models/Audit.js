const mongoose = require('mongoose');

const questionAnswerSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    questionText: { type: String, required: true },
    answer: { type: String, enum: ['yes', 'no'], required: true },
    reason: { type: String, default: '' },
    photos: { type: [String], default: [] },
  },
  { _id: false }
);

const stageSchema = new mongoose.Schema(
  {
    stageId: { type: String, required: true },
    stageName: { type: String, required: true },
    questions: { type: [questionAnswerSchema], required: true },
  },
  { _id: false }
);

const auditSchema = new mongoose.Schema(
  {
    atmId: { type: String, required: true, trim: true },
    area: { type: String, required: true, trim: true },
    auditor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    photos: { type: [String], required: true },
    stages: { type: [stageSchema], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Audit', auditSchema);
