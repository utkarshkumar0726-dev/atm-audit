const mongoose = require('mongoose');

const atmSchema = new mongoose.Schema(
  {
    atmId: { type: String, required: true, unique: true, trim: true },
    area: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
    location: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Atm', atmSchema);
