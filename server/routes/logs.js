const express = require('express');
const { LoginLog, AuditLog, Audit, User } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Auto-backfill existing audits into AuditLog if needed
async function ensureAuditLogsBackfilled() {
  try {
    const existingAuditCount = await Audit.countDocuments();
    const auditLogCount = await AuditLog.countDocuments();
    if (auditLogCount < existingAuditCount) {
      const existingAudits = await Audit.find().populate('auditor', 'name username');
      for (const a of existingAudits) {
        const exists = await AuditLog.findOne({ audit: a._id });
        if (!exists && a.auditor) {
          const qPhotos =
            a.stages?.reduce(
              (acc, s) => acc + (s.questions?.reduce((qAcc, q) => qAcc + (q.photos?.length || 0), 0) || 0),
              0
            ) || 0;
          await AuditLog.create({
            audit: a._id,
            auditor: a.auditor._id || a.auditor,
            auditorName: a.auditor.name || 'Auditor',
            auditorUsername: a.auditor.username || 'auditor',
            atmId: a.atmId,
            area: a.area || '',
            action: 'AUDIT_SUBMITTED',
            photoCount: (a.photos?.length || 0) + qPhotos,
            stageCount: a.stages?.length || 0,
            createdAt: a.createdAt || new Date(),
          });
        }
      }
    }
  } catch (err) {
    console.error('Error backfilling audit logs:', err);
  }
}

// GET /api/logs/stats - aggregate metrics for both login logs & audit logs
router.get('/stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await ensureAuditLogsBackfilled();

    const [
      totalLoginEvents,
      totalLogoutEvents,
      adminLogins,
      auditorLogins,
      totalAuditLogs,
      recentLogins,
    ] = await Promise.all([
      LoginLog.countDocuments({ action: 'LOGIN' }),
      LoginLog.countDocuments({ action: 'LOGOUT' }),
      LoginLog.countDocuments({ action: 'LOGIN', role: 'admin' }),
      LoginLog.countDocuments({ action: 'LOGIN', role: 'auditor' }),
      AuditLog.countDocuments(),
      LoginLog.find().sort({ createdAt: -1 }).limit(5),
    ]);

    res.json({
      totalLoginEvents,
      totalLogoutEvents,
      adminLogins,
      auditorLogins,
      totalAuditLogs,
      recentLogins,
    });
  } catch (err) {
    console.error('Fetch log stats error:', err);
    res.status(500).json({ message: 'Failed to fetch log statistics' });
  }
});

// GET /api/logs/logins - view login & logout logs for both admin & auditor
router.get('/logins', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { role, action, search, limit = 500 } = req.query;
    const filter = {};

    if (role && role !== 'all') {
      filter.role = role.toLowerCase().trim();
    }

    if (action && action !== 'all') {
      filter.action = action.toUpperCase().trim();
    }

    if (search && search.trim()) {
      const q = search.trim();
      const regex = new RegExp(q, 'i');
      filter.$or = [
        { name: regex },
        { username: regex },
        { ip: regex },
        { device: regex },
        { browser: regex },
      ];
    }

    const maxItems = Math.min(parseInt(limit, 10) || 500, 1000);
    const logs = await LoginLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(maxItems);

    res.json(logs);
  } catch (err) {
    console.error('Fetch login logs error:', err);
    res.status(500).json({ message: 'Failed to fetch login logs' });
  }
});

// GET /api/logs/audits - view audit logs (sirf auditor ke dwara kiye gaye audit activities)
router.get('/audits', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await ensureAuditLogsBackfilled();

    const { search, limit = 500 } = req.query;
    const filter = {};

    if (search && search.trim()) {
      const q = search.trim();
      const regex = new RegExp(q, 'i');
      filter.$or = [
        { atmId: regex },
        { auditorName: regex },
        { auditorUsername: regex },
        { area: regex },
        { action: regex },
      ];
    }

    const maxItems = Math.min(parseInt(limit, 10) || 500, 1000);
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(maxItems);

    res.json(logs);
  } catch (err) {
    console.error('Fetch audit logs error:', err);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
