const mongoose = require('mongoose');

const atmSchema = new mongoose.Schema(
  {
    slNo: { type: Number, default: 0 },
    atmId: { type: String, required: true, unique: true, trim: true },
    area: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
    vendor: { type: String, default: '', trim: true },
    bic: { type: String, default: '', trim: true },
    branchName: { type: String, default: '', trim: true },
    inchargeName: { type: String, default: '', trim: true },
    inchargeDesig: { type: String, default: '', trim: true },
    inchargeContact: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    pincode: { type: String, default: '', trim: true },
    state: { type: String, default: '', trim: true },
    siteType: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Atm', atmSchema);
