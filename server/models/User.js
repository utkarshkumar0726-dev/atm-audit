const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['auditor', 'admin'], default: 'auditor' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
