const express = require('express');
const { Assignment, User, Atm, Area } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/assignments - admin views all ATM-to-auditor assignments
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const assignments = await Assignment.find()
      .populate('auditor', 'id name username')
      .populate({
        path: 'atm',
        populate: { path: 'area', select: 'id name' },
      })
      .sort({ createdAt: -1 });
    res.json(assignments);
  } catch (err) {
    console.error('Fetch assignments error:', err);
    res.status(500).json({ message: 'Server error fetching assignments' });
  }
});

// POST /api/assignments - admin assigns an ATM to an auditor (supports reassignment)
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { auditorId, atmId, reassign } = req.body;
    if (!auditorId || !atmId) {
      return res.status(400).json({ message: 'auditorId and atmId are required' });
    }

    const existingThisAuditor = await Assignment.findOne({
      auditor: auditorId,
      atm: atmId,
    });
    if (existingThisAuditor) {
      return res.status(409).json({ message: 'This ATM is already assigned to this auditor' });
    }

    // If reassign is allowed or ATM is assigned to someone else, remove previous assignment
    const existingOther = await Assignment.findOne({ atm: atmId });
    if (existingOther) {
      if (!reassign) {
        return res.status(409).json({
          message: 'This ATM is already assigned to another auditor. Set reassign: true to transfer.',
          currentAssignmentId: existingOther._id,
        });
      }
      await Assignment.deleteMany({ atm: atmId });
    }

    const assignment = await Assignment.create({ auditor: auditorId, atm: atmId });
    const populated = await Assignment.findById(assignment._id)
      .populate('auditor', 'id name username')
      .populate({
        path: 'atm',
        populate: { path: 'area', select: 'id name' },
      });
    res.status(201).json(populated);
  } catch (err) {
    console.error('Create assignment error:', err);
    res.status(500).json({ message: 'Server error creating assignment' });
  }
});

// POST /api/assignments/bulk - assign multiple ATMs to an auditor at once
router.post('/bulk', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { auditorId, atmIds } = req.body;
    if (!auditorId || !Array.isArray(atmIds) || atmIds.length === 0) {
      return res.status(400).json({ message: 'auditorId and non-empty atmIds array are required' });
    }

    const auditor = await User.findById(auditorId);
    if (!auditor) {
      return res.status(404).json({ message: 'Auditor not found' });
    }

    // Remove existing assignments for these ATMs so each ATM has a clean assignment
    await Assignment.deleteMany({ atm: { $in: atmIds } });

    // Create new assignments
    const docs = atmIds.map((atmId) => ({
      auditor: auditorId,
      atm: atmId,
    }));
    await Assignment.insertMany(docs);

    res.json({
      message: `Successfully assigned ${atmIds.length} ATM(s) to ${auditor.name}`,
      count: atmIds.length,
    });
  } catch (err) {
    console.error('Bulk assign error:', err);
    res.status(500).json({ message: 'Server error during bulk assignment' });
  }
});

// POST /api/assignments/by-branch - assign all ATMs matching a branchName or zone
router.post('/by-branch', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { auditorId, branchName, zoneId } = req.body;
    if (!auditorId) {
      return res.status(400).json({ message: 'auditorId is required' });
    }
    if (!branchName && !zoneId) {
      return res.status(400).json({ message: 'Either branchName or zoneId must be specified' });
    }

    const auditor = await User.findById(auditorId);
    if (!auditor) {
      return res.status(404).json({ message: 'Auditor not found' });
    }

    const filter = {};
    if (branchName) {
      filter.branchName = { $regex: new RegExp('^' + branchName.trim() + '$', 'i') };
    }
    if (zoneId) {
      filter.area = zoneId;
    }

    const matchedAtms = await Atm.find(filter).select('_id atmId branchName');
    if (matchedAtms.length === 0) {
      return res.status(404).json({ message: 'No ATMs found matching the given criteria' });
    }

    const atmIds = matchedAtms.map((a) => a._id);

    // Remove prior assignments for these ATMs
    await Assignment.deleteMany({ atm: { $in: atmIds } });

    const docs = atmIds.map((atmId) => ({
      auditor: auditorId,
      atm: atmId,
    }));
    await Assignment.insertMany(docs);

    res.json({
      message: `Assigned ${atmIds.length} ATM(s) from branch "${branchName || 'Selected Zone'}" to ${auditor.name}`,
      count: atmIds.length,
    });
  } catch (err) {
    console.error('Assign by branch error:', err);
    res.status(500).json({ message: 'Server error assigning by branch' });
  }
});

// POST /api/assignments/bulk-unassign - unassign multiple ATMs at once
router.post('/bulk-unassign', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { atmIds, assignmentIds } = req.body;
    if ((!atmIds || atmIds.length === 0) && (!assignmentIds || assignmentIds.length === 0)) {
      return res.status(400).json({ message: 'Provide atmIds or assignmentIds array' });
    }

    let filter = {};
    if (atmIds && atmIds.length > 0) {
      filter = { atm: { $in: atmIds } };
    } else if (assignmentIds && assignmentIds.length > 0) {
      filter = { _id: { $in: assignmentIds } };
    }

    const result = await Assignment.deleteMany(filter);
    res.json({
      message: `Successfully unassigned ${result.deletedCount} ATM(s)`,
      count: result.deletedCount,
    });
  } catch (err) {
    console.error('Bulk unassign error:', err);
    res.status(500).json({ message: 'Server error during bulk unassign' });
  }
});

// DELETE /api/assignments/:id - admin unassigns an ATM from an auditor
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    await Assignment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete assignment error:', err);
    res.status(500).json({ message: 'Server error deleting assignment' });
  }
});

module.exports = router;
