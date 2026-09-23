const express = require('express');
const XLSX = require('xlsx');
const { Atm, Area, Assignment, Audit } = require('../models');
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

    const slNoVal = getCol(r, ['SLNO', 'SNO', 'SRNO']);
    const slNo = Number(slNoVal) || 0;

    const bic = getCol(r, ['BIC', 'BANKIDENTIFIER', 'BRANCHCODE']);
    const branchName = getCol(r, ['BRANCHNAME', 'BRANCH', 'SITENAME']);
    const inchargeName = getCol(r, ['PRESENTINCHARGE', 'INCHARGE', 'CONTACTPERSON']);
    const inchargeDesig = getCol(r, ['INCHARGEDESIG', 'DESIGNATION']);
    const inchargeContact = getCol(r, ['INCHARGECONTACT', 'CONTACT', 'MOBILE', 'PHONE']);
    const zone = getCol(r, ['ZONE', 'AREA', 'REGION', 'CITY']) || 'General';
    const address = getCol(r, ['ADDRESS', 'LOCATION', 'SITEADDRESS']);
    let pincode = getCol(r, ['PINCODE', 'PIN', 'ZIP']);
    let state = getCol(r, ['STATE']);
    let siteType = getCol(r, ['ONSITEOFFSITECRM', 'SITETYPE', 'TYPE']);

    // Check if any cell has a 6-digit pincode in shifted columns
    for (const cell of r) {
      if (cell && /^\d{6}$/.test(String(cell).trim())) {
        pincode = String(cell).trim();
        break;
      }
    }

    const location = branchName || address || zone;
    const link = getCol(r, ['INSTALLATIONREPORTLINK', 'INSTALLATIONREPORTS', 'INSTALLATIONREPORT', 'LINK', 'URL', 'IRLINK']);
    const deviceId = getCol(r, ['DEVICEID', 'UNITID', 'PSBDEVICEID', 'IRUNITID']);

    parsed.push({
      slNo,
      atmId,
      vendor: sheetName || 'General',
      bic,
      branchName,
      inchargeName,
      inchargeDesig,
      inchargeContact,
      zone,
      address,
      pincode,
      state,
      siteType,
      location,
      link,
      deviceId,
    });
  }

  return parsed;
}

// GET /api/atms - admin views the full ATM master list
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const atms = await Atm.find()
      .populate('area', 'id name')
      .sort({ slNo: 1, atmId: 1 });
    res.json(atms);
  } catch (err) {
    console.error('Fetch ATMs error:', err);
    res.status(500).json({ message: 'Server error fetching ATMs' });
  }
});

// GET /api/atms/mine - auditor views only the ATMs assigned to them
router.get('/mine', requireAuth, requireRole('auditor'), async (req, res) => {
  try {
    const [assignments, audits] = await Promise.all([
      Assignment.find({ auditor: req.user.id })
        .populate({
          path: 'atm',
          populate: { path: 'area', select: 'id name' },
        }),
      Audit.find({ auditor: req.user.id }).select('atmId createdAt'),
    ]);

    const auditedMap = new Map();
    audits.forEach((a) => {
      if (a.atmId) {
        auditedMap.set(String(a.atmId).trim().toLowerCase(), a.createdAt);
      }
    });

    const atms = assignments
      .map((a) => a.atm)
      .filter(Boolean)
      .map((atm) => {
        const atmObj = atm.toObject ? atm.toObject() : { ...atm };
        const key = String(atm.atmId || '').trim().toLowerCase();
        atmObj.isAudited = auditedMap.has(key);
        atmObj.lastAuditedAt = auditedMap.get(key) || null;
        return atmObj;
      });

    if (req.query.pending === 'true') {
      return res.json(atms.filter((a) => !a.isAudited));
    }

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
      slNo,
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
      pincode,
      state,
      siteType,
      link,
      links,
      deviceId,
    } = req.body;

    if (!atmId || !atmId.trim()) {
      return res.status(400).json({ message: 'atmId is required' });
    }
    if (!area) {
      return res.status(400).json({ message: 'area is required' });
    }

    const existing = await Atm.findOne({ atmId: atmId.trim() });
    if (existing) {
      return res.status(409).json({ message: 'ATM ID already exists' });
    }

    const cleanLink = link?.trim() || '';
    const cleanLinks = Array.isArray(links)
      ? links.map((l) => String(l).trim()).filter(Boolean)
      : cleanLink
      ? [cleanLink]
      : [];

    const atm = await Atm.create({
      slNo: Number(slNo) || 0,
      atmId: atmId.trim(),
      area,
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
      link: cleanLink || (cleanLinks[0] || ''),
      links: cleanLinks,
      deviceId: deviceId?.trim() || '',
    });

    const populated = await Atm.findById(atm._id).populate('area', 'id name');
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
    const existingAreas = await Area.find();
    const areaMap = new Map();
    for (const a of existingAreas) {
      areaMap.set(a.name.toLowerCase().trim(), a._id);
    }

    let created = 0;
    let updated = 0;
    const areasCreated = new Set();

    for (const item of allAtms) {
      const cleanZone = (item.zone || 'General').trim();
      let areaId = areaMap.get(cleanZone.toLowerCase());

      if (!areaId) {
        const newArea = await Area.create({ name: cleanZone });
        areaId = newArea._id;
        areaMap.set(cleanZone.toLowerCase(), areaId);
        areasCreated.add(cleanZone);
      }

      const existingAtm = await Atm.findOne({ atmId: item.atmId });
      if (existingAtm) {
        existingAtm.area = areaId;
        if (item.slNo) existingAtm.slNo = item.slNo;
        existingAtm.vendor = item.vendor;
        existingAtm.bic = item.bic;
        existingAtm.branchName = item.branchName;
        existingAtm.inchargeName = item.inchargeName;
        existingAtm.inchargeDesig = item.inchargeDesig;
        existingAtm.inchargeContact = item.inchargeContact;
        existingAtm.address = item.address;
        if (item.pincode) existingAtm.pincode = item.pincode;
        existingAtm.state = item.state;
        existingAtm.siteType = item.siteType;
        existingAtm.location = item.location;
        if (item.link) {
          existingAtm.link = item.link;
          if (!existingAtm.links || existingAtm.links.length === 0) existingAtm.links = [item.link];
        }
        if (item.deviceId) existingAtm.deviceId = item.deviceId;
        await existingAtm.save();
        updated++;
      } else {
        await Atm.create({
          slNo: item.slNo,
          atmId: item.atmId,
          area: areaId,
          vendor: item.vendor,
          bic: item.bic,
          branchName: item.branchName,
          inchargeName: item.inchargeName,
          inchargeDesig: item.inchargeDesig,
          inchargeContact: item.inchargeContact,
          address: item.address,
          pincode: item.pincode,
          state: item.state,
          siteType: item.siteType,
          location: item.location,
          link: item.link || '',
          links: item.link ? [item.link] : [],
          deviceId: item.deviceId || '',
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

// POST /api/atms/import-links - match ATM IDs from an Excel sheet and update link / links / deviceId
router.post('/import-links', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ message: 'No file data provided' });
    }

    const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const atmLinksMap = new Map();
    const atmDeviceMap = new Map();

    function registerLink(rawAtmId, link, deviceId) {
      if (!rawAtmId || !link) return;
      const cleanLink = String(link).trim();
      if (!cleanLink.startsWith('http')) return;

      const ids = String(rawAtmId)
        .split(/[,_\/]/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length >= 4);

      for (const id of ids) {
        if (!atmLinksMap.has(id)) atmLinksMap.set(id, []);
        if (!atmLinksMap.get(id).includes(cleanLink)) {
          atmLinksMap.get(id).push(cleanLink);
        }
        if (deviceId && !atmDeviceMap.has(id)) {
          atmDeviceMap.set(id, String(deviceId).trim());
        }
      }
    }

    let totalRows = 0;
    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      totalRows += rows.length;

      for (const row of rows) {
        const atmIdVal =
          row['ATMId'] ||
          row['ATMID'] ||
          row['ATM ID'] ||
          row['IR_ATMId_Raw'] ||
          row['PSB_ATM_IDs'] ||
          row['ATM'] ||
          row['Terminal ID'] ||
          '';

        const linkVal =
          row['Installation_Report_Link'] ||
          row['Installation Reports'] ||
          row['Installation Report'] ||
          row['IR Link'] ||
          row['Link'] ||
          row['URL'] ||
          row['link'] ||
          '';

        const deviceIdVal = row['PSB_Device_ID'] || row['IR_Unit_ID'] || row['Unit ID'] || row['deviceId'] || '';

        registerLink(atmIdVal, linkVal, deviceIdVal);
      }
    }

    const atms = await Atm.find({});
    let updatedCount = 0;

    for (const atm of atms) {
      const normAtmId = atm.atmId.trim().toUpperCase();
      let matchedLinks = atmLinksMap.get(normAtmId) || [];
      let matchedDeviceId = atmDeviceMap.get(normAtmId) || '';

      if (matchedLinks.length === 0) {
        for (const [key, links] of atmLinksMap.entries()) {
          if (key.includes(normAtmId) || normAtmId.includes(key)) {
            matchedLinks = links;
            matchedDeviceId = atmDeviceMap.get(key) || '';
            break;
          }
        }
      }

      if (matchedLinks.length > 0) {
        atm.link = matchedLinks[0];
        atm.links = matchedLinks;
        if (matchedDeviceId) atm.deviceId = matchedDeviceId;
        await atm.save();
        updatedCount++;
      }
    }

    res.json({
      message: `Successfully linked ${updatedCount} ATM(s) from sheet`,
      totalRows,
      updatedCount,
      totalAtmsInDb: atms.length,
    });
  } catch (err) {
    console.error('Import Links error:', err);
    res.status(500).json({ message: 'Error processing links sheet: ' + err.message });
  }
});

// PUT /api/atms/:id - admin edits an ATM
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const {
      slNo,
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
      pincode,
      state,
      siteType,
    } = req.body;

    if (!atmId || !atmId.trim()) {
      return res.status(400).json({ message: 'atmId is required' });
    }
    if (!area) {
      return res.status(400).json({ message: 'area is required' });
    }

    const atm = await Atm.findById(req.params.id);
    if (!atm) return res.status(404).json({ message: 'ATM not found' });

    const existing = await Atm.findOne({
      atmId: atmId.trim(),
      _id: { $ne: atm._id },
    });
    if (existing) {
      return res.status(409).json({ message: 'ATM ID already exists' });
    }

    atm.atmId = atmId.trim();
    atm.area = area;
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
    if (link !== undefined) {
      atm.link = link?.trim() || '';
      if (!atm.links || atm.links.length === 0) atm.links = [atm.link];
    }
    if (links !== undefined && Array.isArray(links)) {
      atm.links = links.map((l) => String(l).trim()).filter(Boolean);
      if (atm.links.length > 0 && !atm.link) atm.link = atm.links[0];
    }
    if (deviceId !== undefined) atm.deviceId = deviceId?.trim() || '';
    await atm.save();

    const populated = await Atm.findById(atm._id).populate('area', 'id name');
    res.json(populated);
  } catch (err) {
    console.error('Update ATM error:', err);
    res.status(500).json({ message: 'Server error updating ATM' });
  }
});

// DELETE /api/atms/:id - admin removes an ATM
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const atm = await Atm.findById(req.params.id);
    if (!atm) return res.status(404).json({ message: 'ATM not found' });

    await Assignment.deleteMany({ atm: atm._id });
    await Atm.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete ATM error:', err);
    res.status(500).json({ message: 'Server error deleting ATM' });
  }
});

module.exports = router;
