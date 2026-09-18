const express = require('express');
const Atm = require('../models/Atm');
const Assignment = require('../models/Assignment');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/atms - admin views the full ATM master list
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const atms = await Atm.find().populate('area', 'name').sort({ atmId: 1 });
  res.json(atms);
});

// GET /api/atms/mine - auditor views only the ATMs assigned to them
router.get('/mine', requireAuth, requireRole('auditor'), async (req, res) => {
  const assignments = await Assignment.find({ auditor: req.user.id }).populate({
    path: 'atm',
    populate: { path: 'area', select: 'name' },
  });
  const atms = assignments.map((a) => a.atm).filter(Boolean);
  res.json(atms);
});

// POST /api/atms - admin adds a new ATM to the master list
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { atmId, area, location } = req.body;
  if (!atmId || !atmId.trim()) {
    return res.status(400).json({ message: 'atmId is required' });
  }
  if (!area) {
    return res.status(400).json({ message: 'area is required' });
  }

  const existing = await Atm.findOne({ atmId: atmId.trim() });
  if (existing) {
    return res.status(409).json({ message: 'ATM ID already exists' });
  }

  const atm = await Atm.create({ atmId: atmId.trim(), area, location: location?.trim() || '' });
  const populated = await atm.populate('area', 'name');
  res.status(201).json(populated);
});

// PUT /api/atms/:id - admin edits an ATM
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { atmId, area, location } = req.body;
  if (!atmId || !atmId.trim()) {
    return res.status(400).json({ message: 'atmId is required' });
  }
  if (!area) {
    return res.status(400).json({ message: 'area is required' });
  }

  const atm = await Atm.findById(req.params.id);
  if (!atm) return res.status(404).json({ message: 'ATM not found' });

  const existing = await Atm.findOne({ atmId: atmId.trim(), _id: { $ne: atm._id } });
  if (existing) {
    return res.status(409).json({ message: 'ATM ID already exists' });
  }

  atm.atmId = atmId.trim();
  atm.area = area;
  atm.location = location?.trim() || '';
  await atm.save();
  const populated = await atm.populate('area', 'name');
  res.json(populated);
});

// DELETE /api/atms/:id - admin removes an ATM (and any assignments for it)
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const atm = await Atm.findByIdAndDelete(req.params.id);
  if (!atm) return res.status(404).json({ message: 'ATM not found' });
  await Assignment.deleteMany({ atm: atm._id });
  res.json({ message: 'Deleted' });
});

module.exports = router;
