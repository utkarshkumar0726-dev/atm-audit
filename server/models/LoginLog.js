const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['admin', 'auditor'], required: true },
    action: { type: String, enum: ['LOGIN', 'LOGOUT'], required: true },
    ip: { type: String, default: '127.0.0.1' },
    userAgent: { type: String, default: '' },
    device: { type: String, default: 'Desktop' },
    browser: { type: String, default: 'Browser' },
  },
  { timestamps: true }
);

loginLogSchema.index({ createdAt: -1 });
loginLogSchema.index({ role: 1 });
loginLogSchema.index({ action: 1 });
loginLogSchema.index({ username: 1 });

module.exports = mongoose.model('LoginLog', loginLogSchema);
