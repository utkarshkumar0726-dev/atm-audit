const express = require('express');
const { Audit, User, AuditLog } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseUserAgent, getClientIp } = require('../utils/agentParser');

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

// POST /api/audits - auditor submits a completed or partial audit form (Stage 1 alone, 1 & 2, or all 3)
router.post('/', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const { atmId, area, photos, stages, auditId } = req.body;

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

    let audit = null;
    let isUpdate = false;

    // If auditId is provided or an existing partial audit exists for this ATM by this auditor, update it
    if (auditId) {
      audit = await Audit.findOne({ _id: auditId, auditor: req.user.id });
    } else {
      // Check if there is an existing audit with fewer stages that is being extended
      const existingAudit = await Audit.findOne({
        atmId: { $regex: new RegExp(`^${atmId.trim()}$`, 'i') },
        auditor: req.user.id,
      }).sort({ createdAt: -1 });

      if (existingAudit && (!existingAudit.stages || existingAudit.stages.length < stages.length)) {
        audit = existingAudit;
      }
    }

    if (audit) {
      isUpdate = true;
      audit.photos = photos && photos.length ? photos : audit.photos;
      audit.stages = stages;
      audit.area = area.trim();
      await audit.save();
    } else {
      audit = await Audit.create({
        atmId: atmId.trim(),
        area: area.trim(),
        auditor: req.user.id,
        photos,
        stages,
      });
    }

    // Record Audit Log event for auditor action
    try {
      const ip = getClientIp(req);
      const { device, browser } = parseUserAgent(req.headers['user-agent']);
      const questionPhotosCount = stages?.reduce(
        (acc, s) => acc + (s.questions?.reduce((qAcc, q) => qAcc + (q.photos?.length || 0), 0) || 0),
        0
      ) || 0;

      const action = isUpdate
        ? 'AUDIT_STAGES_UPDATED'
        : stages.length >= 3
        ? 'FULL_AUDIT_SUBMITTED'
        : stages.length === 1
        ? 'STAGE_1_SUBMITTED'
        : `STAGES_1_${stages.length}_SUBMITTED`;

      await AuditLog.create({
        audit: audit._id,
        auditor: req.user.id,
        auditorName: req.user.name,
        auditorUsername: req.user.username,
        atmId: audit.atmId,
        area: audit.area,
        action,
        photoCount: (photos?.length || 0) + questionPhotosCount,
        stageCount: stages?.length || 0,
        ip,
        userAgent: req.headers['user-agent'] || '',
        device,
        browser,
      });
    } catch (logErr) {
      console.error('Failed to write audit log:', logErr);
    }

    res.status(isUpdate ? 200 : 201).json(audit);
  } catch (err) {
    console.error('Create/update audit error:', err);
    res.status(500).json({ message: 'Server error saving audit' });
  }
});

// GET /api/audits/atm/:atmId - auditor fetches previous audit for an ATM to continue it
router.get('/atm/:atmId', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const audit = await Audit.findOne({
      atmId: { $regex: new RegExp(`^${req.params.atmId.trim()}$`, 'i') },
      auditor: req.user.id,
    }).sort({ createdAt: -1 });

    if (!audit) {
      return res.status(404).json({ message: 'No previous audit found for this ATM' });
    }
    res.json(audit);
  } catch (err) {
    console.error('Fetch ATM audit error:', err);
    res.status(500).json({ message: 'Server error fetching ATM audit' });
  }
});

// GET /api/audits/mine - auditor views their own submitted audits
router.get('/mine', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const audits = await Audit.find({ auditor: req.user.id }).sort({ createdAt: -1 });
    res.json(audits);
  } catch (err) {
    console.error('Fetch my audits error:', err);
    res.status(500).json({ message: 'Server error fetching audits' });
  }
});

// GET /api/audits - admin views all audits, with auditor name + atmId populated (stages included for stage summary)
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const audits = await Audit.find()
      .select('-photos')
      .populate('auditor', 'id name username')
      .sort({ createdAt: -1 });
    res.json(audits);
  } catch (err) {
    console.error('Fetch all audits error:', err);
    res.status(500).json({ message: 'Server error fetching audits' });
  }
});

// GET /api/audits/:id - admin (or the owning auditor) views one full form
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const audit = await Audit.findById(req.params.id).populate('auditor', 'id name username');
    if (!audit) return res.status(404).json({ message: 'Audit not found' });

    const auditorIdStr = audit.auditor?._id?.toString() || audit.auditor?.id?.toString() || audit.auditor?.toString() || '';
    const userIdStr = req.user.id?.toString() || req.user._id?.toString() || '';
    const isOwner = auditorIdStr === userIdStr;

    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ message: 'Forbidden: You can only view audits you conducted' });
    }

    res.json(audit);
  } catch (err) {
    console.error('Fetch audit detail error:', err);
    res.status(500).json({ message: 'Server error fetching audit' });
  }
});

// DELETE /api/audits/:id - admin deletes an audit
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const audit = await Audit.findById(req.params.id);
    if (!audit) {
      return res.status(404).json({ message: 'Audit not found' });
    }

    // Log the deletion in AuditLog
    try {
      const ip = getClientIp(req);
      const { device, browser } = parseUserAgent(req.headers['user-agent']);
      await AuditLog.create({
        audit: audit._id,
        auditor: req.user.id,
        auditorName: `${req.user.name} (Admin)`,
        auditorUsername: req.user.username,
        atmId: audit.atmId,
        area: audit.area,
        action: 'AUDIT_DELETED',
        photoCount: audit.photos?.length || 0,
        stageCount: audit.stages?.length || 0,
        ip,
        userAgent: req.headers['user-agent'] || '',
        device,
        browser,
      });
    } catch (logErr) {
      console.error('Failed to log audit deletion:', logErr);
    }

    await Audit.findByIdAndDelete(req.params.id);

    res.json({ message: `Audit for ATM ${audit.atmId} deleted successfully` });
  } catch (err) {
    console.error('Delete audit error:', err);
    res.status(500).json({ message: 'Server error deleting audit' });
  }
});

module.exports = router;
