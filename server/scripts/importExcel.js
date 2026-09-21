require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { connectDB, sequelize } = require('../config/db');
const { Atm, Area } = require('../models');

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

function parseSheetData(rows, sheetName) {
  const headerIdx = findHeaderIndex(rows);
  if (headerIdx === -1) {
    console.warn(`No ATMID header found in sheet "${sheetName}". Skipping.`);
    return [];
  }

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
      vendor: sheetName,
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

async function run() {
  let filePathArg = process.argv[2];
  if (!filePathArg) {
    const defaultFile = path.resolve(__dirname, '..', '..', 'PROVIGIL AND CMS SITES FOR AUDITING.xlsx');
    if (fs.existsSync(defaultFile)) {
      filePathArg = defaultFile;
    } else {
      console.error('Usage: node scripts/importExcel.js <path-to-excel-file>');
      process.exit(1);
    }
  }

  const resolvedPath = path.resolve(filePathArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`Connecting to MySQL database...`);
  await connectDB();

  console.log(`Reading Excel file: ${resolvedPath}...`);
  const workbook = XLSX.readFile(resolvedPath);
  console.log(`Found sheets: ${workbook.SheetNames.join(', ')}`);

  let allAtms = [];
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const sheetAtms = parseSheetData(rows, sheetName);
    console.log(`- Sheet "${sheetName}": parsed ${sheetAtms.length} ATMs`);
    allAtms = allAtms.concat(sheetAtms);
  }

  console.log(`\nTotal ATMs parsed across all sheets: ${allAtms.length}`);
  if (allAtms.length === 0) {
    console.log('No ATMs found to import.');
    process.exit(0);
  }

  // Cache existing areas
  const existingAreas = await Area.findAll();
  const areaMap = new Map();
  for (const a of existingAreas) {
    areaMap.set(a.name.toLowerCase().trim(), a.id);
  }

  let created = 0;
  let updated = 0;
  const newAreas = new Set();

  for (const item of allAtms) {
    const cleanZone = item.zone.trim();
    let areaId = areaMap.get(cleanZone.toLowerCase());

    if (!areaId) {
      const newArea = await Area.create({ name: cleanZone });
      areaId = newArea.id;
      areaMap.set(cleanZone.toLowerCase(), areaId);
      newAreas.add(cleanZone);
    }

    const [atmRecord, isCreated] = await Atm.findOrCreate({
      where: { atmId: item.atmId },
      defaults: {
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
      },
    });

    if (isCreated) {
      created++;
    } else {
      atmRecord.areaId = areaId;
      atmRecord.vendor = item.vendor;
      atmRecord.bic = item.bic;
      atmRecord.branchName = item.branchName;
      atmRecord.inchargeName = item.inchargeName;
      atmRecord.inchargeDesig = item.inchargeDesig;
      atmRecord.inchargeContact = item.inchargeContact;
      atmRecord.address = item.address;
      atmRecord.state = item.state;
      atmRecord.siteType = item.siteType;
      atmRecord.location = item.location;
      await atmRecord.save();
      updated++;
    }
  }

  console.log('\n======================================');
  console.log('   EXCEL IMPORT COMPLETED IN MYSQL    ');
  console.log('======================================');
  console.log(`Total ATMs Processed : ${allAtms.length}`);
  console.log(`New ATMs Created     : ${created}`);
  console.log(`Existing ATMs Updated: ${updated}`);
  if (newAreas.size > 0) {
    console.log(`New Zones/Areas Added (${newAreas.size}): ${Array.from(newAreas).join(', ')}`);
  }
  console.log('======================================\n');

  await sequelize.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error during import:', err);
  process.exit(1);
});
