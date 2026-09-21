const express = require('express');
const { Assignment, User, Atm, Area } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const assignmentIncludes = [
  { model: User, as: 'auditor', attributes: ['id', 'name', 'username'] },
  {
    model: Atm,
    as: 'atm',
    include: [{ model: Area, as: 'area', attributes: ['id', 'name'] }],
  },
];

// GET /api/assignments - admin views all ATM-to-auditor assignments
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const assignments = await Assignment.findAll({
      include: assignmentIncludes,
      order: [['createdAt', 'DESC']],
    });
    res.json(assignments);
  } catch (err) {
    console.error('Fetch assignments error:', err);
    res.status(500).json({ message: 'Server error fetching assignments' });
  }
});

// POST /api/assignments - admin assigns an ATM to an auditor
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { auditorId, atmId } = req.body;
    if (!auditorId || !atmId) {
      return res.status(400).json({ message: 'auditorId and atmId are required' });
    }

    const existing = await Assignment.findOne({
      where: { auditorId, atmId },
    });
    if (existing) {
      return res.status(409).json({ message: 'This ATM is already assigned to that auditor' });
    }

    const assignment = await Assignment.create({ auditorId, atmId });
    const populated = await Assignment.findByPk(assignment.id, {
      include: assignmentIncludes,
    });
    res.status(201).json(populated);
  } catch (err) {
    console.error('Create assignment error:', err);
    res.status(500).json({ message: 'Server error creating assignment' });
  }
});

// DELETE /api/assignments/:id - admin unassigns an ATM from an auditor
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    await assignment.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete assignment error:', err);
    res.status(500).json({ message: 'Server error deleting assignment' });
  }
});

module.exports = router;
