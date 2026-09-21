require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
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

  const results = [];
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

    for (const cell of r) {
      if (cell && /^\d{6}$/.test(String(cell).trim())) {
        pincode = String(cell).trim();
        break;
      }
    }

    const location = branchName || address || zone;

    results.push({
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
    });
  }

  return results;
}

async function run() {
  const filePath = path.resolve(__dirname, '..', '..', 'PROVIGIL AND CMS SITES FOR AUDITING.xlsx');

  if (!fs.existsSync(filePath)) {
    console.error(`Excel file not found at path: ${filePath}`);
    process.exit(1);
  }

  await connectDB();
  console.log(`Reading Excel file from: ${filePath}`);
  const workbook = XLSX.readFile(filePath);

  let allAtms = [];
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const atms = parseSheetData(rows, sheetName);
    console.log(`Parsed ${atms.length} valid ATMs from sheet "${sheetName}"`);
    allAtms = allAtms.concat(atms);
  }

  console.log(`Total valid ATM rows across all sheets: ${allAtms.length}`);

  const existingAreas = await Area.find();
  const areaMap = new Map();
  for (const a of existingAreas) {
    areaMap.set(a.name.toLowerCase().trim(), a._id);
  }

  let created = 0;
  let updated = 0;
  const newAreas = new Set();

  for (const item of allAtms) {
    const cleanZone = (item.zone || 'General').trim();
    let areaId = areaMap.get(cleanZone.toLowerCase());

    if (!areaId) {
      const newArea = await Area.create({ name: cleanZone });
      areaId = newArea._id;
      areaMap.set(cleanZone.toLowerCase(), areaId);
      newAreas.add(cleanZone);
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
      });
      created++;
    }
  }

  console.log('\n======================================');
  console.log('  EXCEL IMPORT COMPLETED IN MONGODB   ');
  console.log('======================================');
  console.log(`Total ATMs Processed : ${allAtms.length}`);
  console.log(`New ATMs Created     : ${created}`);
  console.log(`Existing ATMs Updated: ${updated}`);
  if (newAreas.size > 0) {
    console.log(`New Zones/Areas Added (${newAreas.size}): ${Array.from(newAreas).join(', ')}`);
  }
  console.log('======================================\n');

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error during import:', err);
  process.exit(1);
});
