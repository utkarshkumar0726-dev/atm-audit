const express = require('express');
const Area = require('../models/Area');
const Atm = require('../models/Atm');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/areas - any authenticated user can list areas
router.get('/', requireAuth, async (req, res) => {
  const areas = await Area.find().sort({ name: 1 });
  res.json(areas);
});

// POST /api/areas - admin creates a new area/zone
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
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
});

// PUT /api/areas/:id - admin renames an area
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'name is required' });
  }

  const area = await Area.findById(req.params.id);
  if (!area) return res.status(404).json({ message: 'Area not found' });

  const existing = await Area.findOne({ name: name.trim(), _id: { $ne: area._id } });
  if (existing) {
    return res.status(409).json({ message: 'Area already exists' });
  }

  area.name = name.trim();
  await area.save();
  res.json(area);
});

// DELETE /api/areas/:id - admin deletes an area (blocked while ATMs reference it)
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const inUse = await Atm.exists({ area: req.params.id });
  if (inUse) {
    return res.status(400).json({ message: 'Cannot delete an area that still has ATMs assigned to it' });
  }

  const area = await Area.findByIdAndDelete(req.params.id);
  if (!area) return res.status(404).json({ message: 'Area not found' });
  res.json({ message: 'Deleted' });
});

module.exports = router;
