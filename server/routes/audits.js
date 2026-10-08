const express = require('express');
const { Audit, User, AuditLog, AuditDraft } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseUserAgent, getClientIp } = require('../utils/agentParser');

const router = express.Router();

function isImageDataUrl(value) {
  return typeof value === 'string' && (
    value.startsWith('data:image/') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/')
  );
}

function getStageSortOrder(stage) {
  const name = String(stage?.stageName || stage?.name || '').toLowerCase();
  const id = String(stage?.stageId || '').toLowerCase();
  const combined = `${name} ${id}`;
  if (combined.includes('1') || combined.includes('hardware')) return 1;
  if (combined.includes('2') || combined.includes('functional')) return 2;
  if (combined.includes('3') || combined.includes('network')) return 3;
  const match = combined.match(/\d+/);
  return match ? parseInt(match[0], 10) : 999;
}

function mergeAuditStages(existingStages = [], incomingStages = []) {
  const stageMap = new Map();

  // First register existing stages
  for (const st of existingStages) {
    if (!st) continue;
    const key = String(st.stageId || st.stageName || '').trim().toLowerCase();
    if (key) {
      stageMap.set(key, JSON.parse(JSON.stringify(st)));
    }
  }

  // Next merge or insert incoming stages
  for (const newStage of incomingStages) {
    if (!newStage) continue;
    const key = String(newStage.stageId || newStage.stageName || '').trim().toLowerCase();
    if (!key) continue;

    if (!stageMap.has(key)) {
      stageMap.set(key, JSON.parse(JSON.stringify(newStage)));
    } else {
      const existing = stageMap.get(key);
      const qMap = new Map();
      (existing.questions || []).forEach((q) => {
        const qKey = String(q.questionId || q.questionText || '').trim().toLowerCase();
        if (qKey) qMap.set(qKey, q);
      });

      (newStage.questions || []).forEach((newQ) => {
        const qKey = String(newQ.questionId || newQ.questionText || '').trim().toLowerCase();
        if (qKey) {
          // If already answered in new question or updating answer
          qMap.set(qKey, newQ);
        }
      });

      existing.questions = Array.from(qMap.values());
      existing.stageName = newStage.stageName || existing.stageName;
      existing.stageId = newStage.stageId || existing.stageId;
      stageMap.set(key, existing);
    }
  }

  const result = Array.from(stageMap.values());
  return result.sort((a, b) => getStageSortOrder(a) - getStageSortOrder(b));
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

// POST /api/audits - auditor submits or updates audit stage(s) (Stage 1 alone, Stage 2, Stage 3, or all 3)
router.post('/', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const { atmId, area, photos, stages, auditId } = req.body;

    if (!atmId || !atmId.trim()) {
      return res.status(400).json({ message: 'atmId is required' });
    }

    if (!area || !area.trim()) {
      return res.status(400).json({ message: 'area is required' });
    }

    // Look up any existing audits for this atmId and auditor
    let existingAudits = [];
    if (auditId) {
      const byId = await Audit.findOne({ _id: auditId, auditor: req.user.id });
      if (byId) existingAudits.push(byId);
    }

    const byAtm = await Audit.find({
      atmId: { $regex: new RegExp(`^${atmId.trim()}$`, 'i') },
      auditor: req.user.id,
    }).sort({ createdAt: -1 });

    for (const ea of byAtm) {
      if (!existingAudits.some((a) => a._id.toString() === ea._id.toString())) {
        existingAudits.push(ea);
      }
    }

    const primaryAudit = existingAudits[0] || null;

    // Photos validation: either incoming photos are provided, OR existing audit already has photos
    const hasIncomingPhotos = Array.isArray(photos) && photos.length > 0 && photos.every(isImageDataUrl);
    const hasExistingPhotos = primaryAudit && Array.isArray(primaryAudit.photos) && primaryAudit.photos.length > 0;

    if (!hasIncomingPhotos && !hasExistingPhotos) {
      return res.status(400).json({ message: 'At least one ATM photo is required to start the audit' });
    }

    const validationError = validateStages(stages);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    let audit = null;
    let isUpdate = false;

    if (primaryAudit) {
      isUpdate = true;
      audit = primaryAudit;

      // Consolidate and clean up any historical duplicate audits for this ATM
      if (existingAudits.length > 1) {
        for (const dup of existingAudits.slice(1)) {
          audit.stages = mergeAuditStages(audit.stages, dup.stages);
          if (Array.isArray(dup.photos)) {
            audit.photos = Array.from(new Set([...(audit.photos || []), ...dup.photos]));
          }
          await Audit.findByIdAndDelete(dup._id);
        }
      }

      // Merge new stage(s) into existing audit stages
      audit.stages = mergeAuditStages(audit.stages, stages);

      // Update photos if new ones were submitted
      if (hasIncomingPhotos) {
        audit.photos = photos;
      }
      audit.area = area.trim();
      await audit.save();
    } else {
      audit = await Audit.create({
        atmId: atmId.trim(),
        area: area.trim(),
        auditor: req.user.id,
        photos: hasIncomingPhotos ? photos : [],
        stages: mergeAuditStages([], stages),
      });
    }

    // Record Audit Log event for auditor action
    try {
      const ip = getClientIp(req);
      const { device, browser } = parseUserAgent(req.headers['user-agent']);
      const totalPhotosCount = (audit.photos?.length || 0) + (
        audit.stages?.reduce(
          (acc, s) => acc + (s.questions?.reduce((qAcc, q) => qAcc + (q.photos?.length || 0), 0) || 0),
          0
        ) || 0
      );

      const action = isUpdate
        ? (audit.stages.length >= 3 ? 'AUDIT_ALL_STAGES_COMPLETED' : `AUDIT_STAGE_${stages.map(s => s.stageName).join('_')}_UPDATED`)
        : (audit.stages.length >= 3 ? 'FULL_AUDIT_SUBMITTED' : `AUDIT_INITIAL_STAGE_SUBMITTED`);

      await AuditLog.create({
        audit: audit._id,
        auditor: req.user.id,
        auditorName: req.user.name,
        auditorUsername: req.user.username,
        atmId: audit.atmId,
        area: audit.area,
        action,
        photoCount: totalPhotosCount,
        stageCount: audit.stages?.length || 0,
        ip,
        userAgent: req.headers['user-agent'] || '',
        device,
        browser,
      });
    } catch (logErr) {
      console.error('Failed to write audit log:', logErr);
    }

    // Clean up draft from MongoDB since these stages have been committed
    try {
      await AuditDraft.deleteMany({
        auditor: req.user.id,
        $or: [
          { atmId: { $regex: new RegExp(`^${atmId.trim()}$`, 'i') } },
          { atmId: '' },
        ],
      });
    } catch (draftErr) {
      console.warn('Failed to clean up draft after audit submit:', draftErr);
    }

    res.status(isUpdate ? 200 : 201).json(audit);
  } catch (err) {
    console.error('Create/update audit error:', err);
    res.status(500).json({ message: 'Server error saving audit' });
  }
});

// GET /api/audits/draft - auditor fetches in-progress draft (optionally filtered by ?atmId=...)
router.get('/draft', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const { atmId } = req.query;
    let draft = null;

    if (atmId && atmId.trim()) {
      draft = await AuditDraft.findOne({
        auditor: req.user.id,
        atmId: { $regex: new RegExp(`^${atmId.trim()}$`, 'i') },
      }).sort({ updatedAt: -1 });
    } else {
      draft = await AuditDraft.findOne({ auditor: req.user.id }).sort({ updatedAt: -1 });
    }

    res.json({ draft });
  } catch (err) {
    console.error('Fetch draft error:', err);
    res.status(500).json({ message: 'Server error fetching draft' });
  }
});

// POST /api/audits/draft - auditor saves/syncs their draft to the cloud across devices
router.post('/draft', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const {
      selectedAtm,
      photos,
      stages,
      stageIndex,
      started,
      existingAuditId,
      continuingAudit,
      atmId,
      savedAt,
    } = req.body;

    const targetAtmId = (atmId || selectedAtm?.atmId || '').trim();
    const { device } = parseUserAgent(req.headers['user-agent']);

    const updateData = {
      auditor: req.user.id,
      atmId: targetAtmId,
      selectedAtm: selectedAtm || null,
      photos: Array.isArray(photos) ? photos : [],
      stages: Array.isArray(stages) ? stages : [],
      stageIndex: Number.isInteger(stageIndex) ? stageIndex : 0,
      started: !!started,
      existingAuditId: existingAuditId || null,
      continuingAudit: !!continuingAudit,
      lastDevice: device || 'Web',
      savedAt: savedAt ? new Date(savedAt) : new Date(),
    };

    // Find and update or insert
    const query = {
      auditor: req.user.id,
      ...(targetAtmId ? { atmId: { $regex: new RegExp(`^${targetAtmId}$`, 'i') } } : {}),
    };

    const draft = await AuditDraft.findOneAndUpdate(
      query,
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ ok: true, draft });
  } catch (err) {
    console.error('Save draft error:', err);
    res.status(500).json({ message: 'Server error saving draft' });
  }
});

// DELETE /api/audits/draft - delete draft when submitted or discarded
router.delete('/draft', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const { atmId } = req.query;
    const query = { auditor: req.user.id };
    if (atmId && atmId.trim()) {
      query.atmId = { $regex: new RegExp(`^${atmId.trim()}$`, 'i') };
    }
    await AuditDraft.deleteMany(query);
    res.json({ ok: true, message: 'Draft cleared' });
  } catch (err) {
    console.error('Clear draft error:', err);
    res.status(500).json({ message: 'Server error clearing draft' });
  }
});

// GET /api/audits/atm/:atmId - auditor fetches previous audit for an ATM to continue it
router.get('/atm/:atmId', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const audits = await Audit.find({
      atmId: { $regex: new RegExp(`^${req.params.atmId.trim()}$`, 'i') },
      auditor: req.user.id,
    }).sort({ createdAt: -1 });

    if (!audits || audits.length === 0) {
      return res.status(404).json({ message: 'No previous audit found for this ATM' });
    }

    let primaryAudit = audits[0];
    if (audits.length > 1) {
      // Consolidate all historical fragments into primaryAudit
      for (const dup of audits.slice(1)) {
        primaryAudit.stages = mergeAuditStages(primaryAudit.stages, dup.stages);
        if (Array.isArray(dup.photos)) {
          primaryAudit.photos = Array.from(new Set([...(primaryAudit.photos || []), ...dup.photos]));
        }
        await Audit.findByIdAndDelete(dup._id);
      }
      primaryAudit.stages = mergeAuditStages([], primaryAudit.stages);
      await primaryAudit.save();
    }

    res.json(primaryAudit);
  } catch (err) {
    console.error('Fetch ATM audit error:', err);
    res.status(500).json({ message: 'Server error fetching ATM audit' });
  }
});

// GET /api/audits/mine - auditor views their own submitted audits
router.get('/mine', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const rawAudits = await Audit.find({ auditor: req.user.id }).sort({ createdAt: -1 });
    
    // Group and consolidate any duplicate records for the same ATM
    const atmMap = new Map();
    const audits = [];

    for (const audit of rawAudits) {
      const key = String(audit.atmId || '').trim().toLowerCase();
      if (!atmMap.has(key)) {
        atmMap.set(key, audit);
        audits.push(audit);
      } else {
        // If a duplicate exists, merge stages into the earlier registered audit
        const existing = atmMap.get(key);
        existing.stages = mergeAuditStages(existing.stages, audit.stages);
      }
    }

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
