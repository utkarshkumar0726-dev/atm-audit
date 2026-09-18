const express = require('express');
const Assignment = require('../models/Assignment');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function populateAssignment(query) {
  return query
    .populate('auditor', 'name username')
    .populate({ path: 'atm', populate: { path: 'area', select: 'name' } });
}

// GET /api/assignments - admin views all ATM-to-auditor assignments
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const assignments = await populateAssignment(Assignment.find().sort({ createdAt: -1 }));
  res.json(assignments);
});

// POST /api/assignments - admin assigns an ATM to an auditor
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { auditorId, atmId } = req.body;
  if (!auditorId || !atmId) {
    return res.status(400).json({ message: 'auditorId and atmId are required' });
  }

  const existing = await Assignment.findOne({ auditor: auditorId, atm: atmId });
  if (existing) {
    return res.status(409).json({ message: 'This ATM is already assigned to that auditor' });
  }

  const assignment = await Assignment.create({ auditor: auditorId, atm: atmId });
  const populated = await populateAssignment(Assignment.findById(assignment._id));
  res.status(201).json(populated);
});

// DELETE /api/assignments/:id - admin unassigns an ATM from an auditor
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const assignment = await Assignment.findByIdAndDelete(req.params.id);
  if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
  res.json({ message: 'Deleted' });
});

module.exports = router;
