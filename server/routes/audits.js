const express = require('express');
const { Audit, User } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function isImageDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function validateStages(stages) {
  if (!Array.isArray(stages) || stages.length === 0) {
    return 'stages must be a non-empty array';
  }
  for (const stage of stages) {
    if (!stage.stageId || !stage.stageName || !Array.isArray(stage.questions)) {
      return 'each stage requires stageId, stageName, and a questions array';
    }
    for (const q of stage.questions) {
      if (!q.questionId || !q.questionText || !['yes', 'no'].includes(q.answer)) {
        return 'each question requires questionId, questionText, and answer of yes/no';
      }
      if (q.answer === 'no' && !q.reason?.trim()) {
        return `a reason is required when the answer is "no" (question: ${q.questionText})`;
      }
      if (q.photos && (!Array.isArray(q.photos) || !q.photos.every(isImageDataUrl))) {
        return `invalid photos for question: ${q.questionText}`;
      }
    }
  }
  return null;
}

// POST /api/audits - auditor submits a completed audit form
router.post('/', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const { atmId, area, photos, stages } = req.body;

    if (!atmId || !atmId.trim()) {
      return res.status(400).json({ message: 'atmId is required' });
    }

    if (!area || !area.trim()) {
      return res.status(400).json({ message: 'area is required' });
    }

    if (!Array.isArray(photos) || photos.length === 0 || !photos.every(isImageDataUrl)) {
      return res.status(400).json({ message: 'At least one ATM photo is required to start the audit' });
    }

    const validationError = validateStages(stages);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const audit = await Audit.create({
      atmId: atmId.trim(),
      area: area.trim(),
      auditorId: req.user.id,
      photos,
      stages,
    });

    res.status(201).json(audit);
  } catch (err) {
    console.error('Create audit error:', err);
    res.status(500).json({ message: 'Server error saving audit' });
  }
});

// GET /api/audits/mine - auditor views their own submitted audits
router.get('/mine', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const audits = await Audit.findAll({
      where: { auditorId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    res.json(audits);
  } catch (err) {
    console.error('Fetch my audits error:', err);
    res.status(500).json({ message: 'Server error fetching audits' });
  }
});

// GET /api/audits - admin views all audits, with auditor name + atmId populated
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const audits = await Audit.findAll({
      attributes: { exclude: ['photos', 'stages'] },
      include: [{ model: User, as: 'auditor', attributes: ['id', 'name', 'username'] }],
      order: [['createdAt', 'DESC']],
    });
    res.json(audits);
  } catch (err) {
    console.error('Fetch all audits error:', err);
    res.status(500).json({ message: 'Server error fetching audits' });
  }
});

// GET /api/audits/:id - admin (or the owning auditor) views one full form
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const audit = await Audit.findByPk(req.params.id, {
      include: [{ model: User, as: 'auditor', attributes: ['id', 'name', 'username'] }],
    });
    if (!audit) return res.status(404).json({ message: 'Audit not found' });

    const isOwner = Number(audit.auditorId) === Number(req.user.id);
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(audit);
  } catch (err) {
    console.error('Fetch audit detail error:', err);
    res.status(500).json({ message: 'Server error fetching audit' });
  }
});

module.exports = router;
