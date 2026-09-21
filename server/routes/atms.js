const express = require('express');
const { Op } = require('sequelize');
const XLSX = require('xlsx');
const { Atm, Area, Assignment } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function findHeaderIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (Array.isArray(row)) {
      const match = row.some((col) => col && String(col).toUpperCase().includes('ATMID'));
      if (match) return i;
    }
  }
  return -1;
}

function parseSheetRows(rows, sheetName) {
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx === -1) return [];

  const rawHeaders = rows[headerIdx];
  const colMap = {};
  rawHeaders.forEach((h, idx) => {
    if (!h) return;
    const clean = String(h).toUpperCase().replace(/[^A-Z0-9]/g, '');
    colMap[clean] = idx;
  });

  const getCol = (row, candidates) => {
    for (const c of candidates) {
      const idx = colMap[c];
      if (idx !== undefined && row[idx] !== undefined && row[idx] !== null) {
        const val = String(row[idx]).trim();
        if (val) return val;
      }
    }
    return '';
  };

  const parsed = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !Array.isArray(r)) continue;

    const atmId = getCol(r, ['ATMID', 'ATM', 'TERMINALID', 'TERMINAL', 'ATMNO']);
    if (!atmId) continue;

    const bic = getCol(r, ['BIC', 'BANKIDENTIFIER', 'BRANCHCODE']);
    const branchName = getCol(r, ['BRANCHNAME', 'BRANCH', 'SITENAME']);
    const inchargeName = getCol(r, ['PRESENTINCHARGE', 'INCHARGE', 'CONTACTPERSON']);
    const inchargeDesig = getCol(r, ['INCHARGEDESIG', 'DESIGNATION']);
    const inchargeContact = getCol(r, ['INCHARGECONTACT', 'CONTACT', 'MOBILE', 'PHONE']);
    const zone = getCol(r, ['ZONE', 'AREA', 'REGION', 'CITY']) || 'General';
    const address = getCol(r, ['ADDRESS', 'LOCATION', 'SITEADDRESS']);
    const state = getCol(r, ['STATE']);
    const siteType = getCol(r, ['ONSITEOFFSITECRM', 'SITETYPE', 'TYPE']);
    const location = branchName || address || zone;

    parsed.push({
      atmId,
      vendor: sheetName || 'General',
      bic,
      branchName,
      inchargeName,
      inchargeDesig,
      inchargeContact,
      zone,
      address,
      state,
      siteType,
      location,
    });
  }

  return parsed;
}

// GET /api/atms - admin views the full ATM master list
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const atms = await Atm.findAll({
      include: [{ model: Area, as: 'area', attributes: ['id', 'name'] }],
      order: [
        ['slNo', 'ASC'],
        ['atmId', 'ASC'],
      ],
    });
    res.json(atms);
  } catch (err) {
    console.error('Fetch ATMs error:', err);
    res.status(500).json({ message: 'Server error fetching ATMs' });
  }
});

// GET /api/atms/mine - auditor views only the ATMs assigned to them
router.get('/mine', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const assignments = await Assignment.findAll({
      where: { auditorId: req.user.id },
      include: [
        {
          model: Atm,
          as: 'atm',
          include: [{ model: Area, as: 'area', attributes: ['id', 'name'] }],
        },
      ],
    });
    const atms = assignments.map((a) => a.atm).filter(Boolean);
    res.json(atms);
  } catch (err) {
    console.error('Fetch my ATMs error:', err);
    res.status(500).json({ message: 'Server error fetching assigned ATMs' });
  }
});

// POST /api/atms - admin adds a new ATM to the master list
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const {
      atmId,
      area,
      location,
      vendor,
      bic,
      branchName,
      inchargeName,
      inchargeDesig,
      inchargeContact,
      address,
      state,
      siteType,
    } = req.body;

    if (!atmId || !atmId.trim()) {
      return res.status(400).json({ message: 'atmId is required' });
    }
    if (!area) {
      return res.status(400).json({ message: 'area is required' });
    }

    const existing = await Atm.findOne({ where: { atmId: atmId.trim() } });
    if (existing) {
      return res.status(409).json({ message: 'ATM ID already exists' });
    }

    const atm = await Atm.create({
      slNo: Number(slNo) || 0,
      atmId: atmId.trim(),
      areaId: area,
      location: location?.trim() || branchName?.trim() || '',
      vendor: vendor?.trim() || '',
      bic: bic?.trim() || '',
      branchName: branchName?.trim() || '',
      inchargeName: inchargeName?.trim() || '',
      inchargeDesig: inchargeDesig?.trim() || '',
      inchargeContact: inchargeContact?.trim() || '',
      address: address?.trim() || '',
      pincode: pincode?.trim() || '',
      state: state?.trim() || '',
      siteType: siteType?.trim() || '',
    });

    const populated = await Atm.findByPk(atm.id, {
      include: [{ model: Area, as: 'area', attributes: ['id', 'name'] }],
    });
    res.status(201).json(populated);
  } catch (err) {
    console.error('Create ATM error:', err);
    res.status(500).json({ message: 'Server error creating ATM' });
  }
});

// POST /api/atms/import-excel - admin uploads excel/csv (base64)
router.post('/import-excel', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ message: 'No file data provided' });
    }

    const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    let allAtms = [];
    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const parsed = parseSheetRows(rows, sheetName);
      allAtms = allAtms.concat(parsed);
    }

    if (allAtms.length === 0) {
      return res.status(400).json({ message: 'No valid ATM rows with ATMID found in the uploaded file' });
    }

    // Cache existing areas
    const existingAreas = await Area.findAll();
    const areaMap = new Map();
    for (const a of existingAreas) {
      areaMap.set(a.name.toLowerCase().trim(), a.id);
    }

    let created = 0;
    let updated = 0;
    const areasCreated = new Set();

    for (const item of allAtms) {
      const cleanZone = (item.zone || 'General').trim();
      let areaId = areaMap.get(cleanZone.toLowerCase());

      if (!areaId) {
        const newArea = await Area.create({ name: cleanZone });
        areaId = newArea.id;
        areaMap.set(cleanZone.toLowerCase(), areaId);
        areasCreated.add(cleanZone);
      }

      const existingAtm = await Atm.findOne({ where: { atmId: item.atmId } });
      if (existingAtm) {
        existingAtm.areaId = areaId;
        existingAtm.vendor = item.vendor;
        existingAtm.bic = item.bic;
        existingAtm.branchName = item.branchName;
        existingAtm.inchargeName = item.inchargeName;
        existingAtm.inchargeDesig = item.inchargeDesig;
        existingAtm.inchargeContact = item.inchargeContact;
        existingAtm.address = item.address;
        existingAtm.state = item.state;
        existingAtm.siteType = item.siteType;
        existingAtm.location = item.location;
        await existingAtm.save();
        updated++;
      } else {
        await Atm.create({
          atmId: item.atmId,
          areaId,
          vendor: item.vendor,
          bic: item.bic,
          branchName: item.branchName,
          inchargeName: item.inchargeName,
          inchargeDesig: item.inchargeDesig,
          inchargeContact: item.inchargeContact,
          address: item.address,
          state: item.state,
          siteType: item.siteType,
          location: item.location,
        });
        created++;
      }
    }

    res.json({
      message: 'Excel import completed successfully',
      totalRows: allAtms.length,
      created,
      updated,
      newAreasCreated: Array.from(areasCreated),
    });
  } catch (err) {
    console.error('Import Excel error:', err);
    res.status(500).json({ message: 'Error processing Excel file: ' + err.message });
  }
});

// PUT /api/atms/:id - admin edits an ATM
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const {
      atmId,
      area,
      location,
      vendor,
      bic,
      branchName,
      inchargeName,
      inchargeDesig,
      inchargeContact,
      address,
      state,
      siteType,
    } = req.body;

    if (!atmId || !atmId.trim()) {
      return res.status(400).json({ message: 'atmId is required' });
    }
    if (!area) {
      return res.status(400).json({ message: 'area is required' });
    }

    const atm = await Atm.findByPk(req.params.id);
    if (!atm) return res.status(404).json({ message: 'ATM not found' });

    const existing = await Atm.findOne({
      where: {
        atmId: atmId.trim(),
        id: { [Op.ne]: atm.id },
      },
    });
    if (existing) {
      return res.status(409).json({ message: 'ATM ID already exists' });
    }

    atm.atmId = atmId.trim();
    atm.areaId = area;
    if (slNo !== undefined) atm.slNo = Number(slNo) || 0;
    if (location !== undefined) atm.location = location?.trim() || '';
    if (vendor !== undefined) atm.vendor = vendor?.trim() || '';
    if (bic !== undefined) atm.bic = bic?.trim() || '';
    if (branchName !== undefined) atm.branchName = branchName?.trim() || '';
    if (inchargeName !== undefined) atm.inchargeName = inchargeName?.trim() || '';
    if (inchargeDesig !== undefined) atm.inchargeDesig = inchargeDesig?.trim() || '';
    if (inchargeContact !== undefined) atm.inchargeContact = inchargeContact?.trim() || '';
    if (address !== undefined) atm.address = address?.trim() || '';
    if (pincode !== undefined) atm.pincode = pincode?.trim() || '';
    if (state !== undefined) atm.state = state?.trim() || '';
    if (siteType !== undefined) atm.siteType = siteType?.trim() || '';
    await atm.save();

    const populated = await Atm.findByPk(atm.id, {
      include: [{ model: Area, as: 'area', attributes: ['id', 'name'] }],
    });
    res.json(populated);
  } catch (err) {
    console.error('Update ATM error:', err);
    res.status(500).json({ message: 'Server error updating ATM' });
  }
});

// DELETE /api/atms/:id - admin removes an ATM
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const atm = await Atm.findByPk(req.params.id);
    if (!atm) return res.status(404).json({ message: 'ATM not found' });

    await Assignment.destroy({ where: { atmId: atm.id } });
    await atm.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete ATM error:', err);
    res.status(500).json({ message: 'Server error deleting ATM' });
  }
});

module.exports = router;
