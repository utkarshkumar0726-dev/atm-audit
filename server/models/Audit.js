const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema(
  {
    atmId: { type: String, required: true },
    area: { type: String, required: true },
    auditor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    photos: [{ type: String }],
    stages: [
      {
        stageName: String,
        responses: [
          {
            questionText: String,
            answer: { type: String, enum: ['yes', 'no', 'na'] },
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Audit', auditSchema);
