require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { Atm, Area, Assignment, Audit } = require('../models');

function normalizeZone(zone) {
  if (!zone) return 'General';
  let z = String(zone).trim().toUpperCase();
  // normalize spaces around hyphens: "DELHI- II" -> "DELHI-II", "DELHI - I" -> "DELHI-I"
  z = z.replace(/\s*-\s*/g, '-');
  return z;
}

function parseRowData(r, sheetName, rowIdx) {
  if (!r || !Array.isArray(r) || r.length < 2) return null;

  const rawSlNo = r[0];
  const atmId = r[1] ? String(r[1]).trim() : '';
  if (!atmId || atmId.toUpperCase() === 'ATMID') return null;

  const bic = r[2] ? String(r[2]).trim() : '';
  const branchName = r[3] ? String(r[3]).trim() : '';
  const inchargeName = r[4] ? String(r[4]).trim() : '';
  const inchargeDesig = r[5] ? String(r[5]).trim() : '';
  const inchargeContact = r[6] ? String(r[6]).trim() : '';
  const rawZone = r[7] ? String(r[7]).trim() : 'General';
  const zone = normalizeZone(rawZone);
  const address = r[8] ? String(r[8]).trim() : '';

  let pincode = '';
  let state = '';
  let siteType = '';

  // Check if column 9 is a 6-digit pincode (like in Provigil rows 62-74)
  const col9 = r[9] ? String(r[9]).trim() : '';
  const col10 = r[10] ? String(r[10]).trim() : '';
  const col11 = r[11] ? String(r[11]).trim() : '';

  if (/^\d{6}$/.test(col9)) {
    pincode = col9;
    state = col10;
    siteType = col11 || 'ONSITE';
  } else {
    state = col9;
    siteType = col10 || 'ONSITE';
    // try to extract 6 digit pincode from address
    const match = address.match(/\b\d{6}\b/);
    if (match) pincode = match[0];
  }

  const slNo = Number(rawSlNo) || rowIdx;
  const location = branchName || address || zone;

  return {
    slNo,
    atmId,
    vendor: sheetName,
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
  };
}

async function cleanAndImport() {
  const filePath = path.resolve(__dirname, '..', '..', 'PROVIGIL AND CMS SITES FOR AUDITING.xlsx');
  if (!fs.existsSync(filePath)) {
    console.error(`Excel file not found at: ${filePath}`);
    process.exit(1);
  }

  console.log('Connecting to MongoDB database...');
  await connectDB();

  console.log('\n--- Wiping old dummy data from MongoDB ---');
  await Assignment.deleteMany({});
  await Audit.deleteMany({});
  await Atm.deleteMany({});
  await Area.deleteMany({});
  console.log('Cleared old ATMs, Areas, and Assignments.');

  console.log(`\nReading Excel file: ${filePath}...`);
  const workbook = XLSX.readFile(filePath);
  console.log('Sheets found:', workbook.SheetNames);

  const allAtms = [];
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    console.log(`Processing Sheet "${sheetName}" (total raw rows: ${data.length})...`);

    // Row 0 is title, Row 1 is header, data starts from Row 2
    let count = 0;
    for (let r = 2; r < data.length; r++) {
      const parsed = parseRowData(data[r], sheetName, count + 1);
      if (parsed) {
        allAtms.push(parsed);
        count++;
      }
    }
    console.log(`- Parsed ${count} valid ATMs from "${sheetName}"`);
  }

  console.log(`\nTotal valid ATMs extracted from Excel: ${allAtms.length}`);

  // Create unique Areas/Zones
  const zoneSet = new Set(allAtms.map((a) => a.zone));
  const areaMap = new Map();

  for (const zoneName of zoneSet) {
    const area = await Area.create({ name: zoneName });
    areaMap.set(zoneName, area._id);
  }
  console.log(`Created ${zoneSet.size} Zones in database:`, Array.from(zoneSet).join(', '));

  // Insert all ATMs
  let inserted = 0;
  for (const item of allAtms) {
    const areaId = areaMap.get(item.zone);
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
    });
    inserted++;
  }

  console.log(`\n======================================================`);
  console.log(`  SUCCESS: ${inserted} REAL ATMS IMPORTED TO MONGODB  `);
  console.log(`======================================================`);
  console.log(`Provigil ATMs: ${allAtms.filter((a) => a.vendor === 'Provigil').length}`);
  console.log(`CMS ATMs     : ${allAtms.filter((a) => a.vendor === 'CMS').length}`);
  console.log(`Unique Zones : ${zoneSet.size}`);
  console.log(`======================================================\n`);

  await mongoose.connection.close();
  process.exit(0);
}

cleanAndImport().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
