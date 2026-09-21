const express = require('express');
const { Area, Atm } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/areas - any authenticated user can list areas
router.get('/', requireAuth, async (req, res) => {
  try {
    const areas = await Area.find().sort({ name: 1 });
    res.json(areas);
  } catch (err) {
    console.error('Fetch areas error:', err);
    res.status(500).json({ message: 'Server error fetching areas' });
  }
});

// POST /api/areas - admin creates a new area/zone
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    const existing = await Area.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ message: 'Area already exists' });
    }

    const area = await Area.create({ name: name.trim() });
    res.status(201).json(area);
  } catch (err) {
    console.error('Create area error:', err);
    res.status(500).json({ message: 'Server error creating area' });
  }
});

// PUT /api/areas/:id - admin renames an area
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    const area = await Area.findById(req.params.id);
    if (!area) return res.status(404).json({ message: 'Area not found' });

    const existing = await Area.findOne({
      name: name.trim(),
      _id: { $ne: area._id },
    });
    if (existing) {
      return res.status(409).json({ message: 'Area already exists' });
    }

    area.name = name.trim();
    await area.save();
    res.json(area);
  } catch (err) {
    console.error('Update area error:', err);
    res.status(500).json({ message: 'Server error updating area' });
  }
});

// DELETE /api/areas/:id - admin deletes an area (blocked while ATMs reference it)
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const inUse = await Atm.findOne({ area: req.params.id });
    if (inUse) {
      return res.status(400).json({ message: 'Cannot delete an area that still has ATMs assigned to it' });
    }

    const area = await Area.findById(req.params.id);
    if (!area) return res.status(404).json({ message: 'Area not found' });

    await Area.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete area error:', err);
    res.status(500).json({ message: 'Server error deleting area' });
  }
});

module.exports = router;
