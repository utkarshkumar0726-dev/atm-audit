const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Atm = require('../models/Atm');

async function syncLinks(customFilePath) {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/atm_audit';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected.');

  // Maps from normalized ATM ID to array of link URLs and deviceId
  const atmLinksMap = new Map();
  const atmDeviceMap = new Map();

  function registerLink(rawAtmId, link, deviceId) {
    if (!rawAtmId || !link) return;
    const cleanLink = String(link).trim();
    if (!cleanLink.startsWith('http')) return;

    // Split compound IDs like "RPSBH060601,SPSBP060602" or "RPSBH060601_SPSBP060602"
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

  // 1. Process files
  const fileCandidates = customFilePath
    ? [customFilePath]
    : [
        path.join(__dirname, '../../Documents/PSB_Audit_Data_Row_Wise_V2.xlsx'),
        path.join(__dirname, '../../Documents/PSB Installed Sites IR Data.xlsx'),
      ];

  for (const filePath of fileCandidates) {
    if (!fs.existsSync(filePath)) {
      console.log(`File not found, skipping: ${filePath}`);
      continue;
    }

    console.log(`\nReading ${path.basename(filePath)}...`);
    const wb = xlsx.readFile(filePath);

    for (const sheetName of wb.SheetNames) {
      const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName]);
      console.log(`  Processing sheet "${sheetName}" (${rows.length} rows)...`);

      for (const row of rows) {
        // Try common column names for ATM ID
        const atmIdVal =
          row['ATMId'] ||
          row['ATMID'] ||
          row['ATM ID'] ||
          row['IR_ATMId_Raw'] ||
          row['PSB_ATM_IDs'] ||
          row['ATM'] ||
          row['Terminal ID'] ||
          '';

        // Try common column names for Link
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
  }

  console.log(`\nCollected link data for ${atmLinksMap.size} distinct ATM IDs.`);

  // 2. Match and update ATMs in MongoDB
  const atms = await Atm.find({});
  console.log(`Found ${atms.length} ATMs in database.`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const atm of atms) {
    const normAtmId = atm.atmId.trim().toUpperCase();
    let matchedLinks = atmLinksMap.get(normAtmId) || [];
    let matchedDeviceId = atmDeviceMap.get(normAtmId) || '';

    // If not exact match, check compound containment
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
      console.log(`  ✓ Updated ATM ${atm.atmId}: ${matchedLinks.length} link(s) attached`);
    } else {
      skippedCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Sync Complete:`);
  console.log(`Total ATMs in DB: ${atms.length}`);
  console.log(`Successfully Updated with Link: ${updatedCount}`);
  console.log(`Without Link (Not found in sheet): ${skippedCount}`);
  console.log(`========================================\n`);

  await mongoose.disconnect();
}

const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
syncLinks(inputPath).catch((err) => {
  console.error('Error during sync:', err);
  process.exit(1);
});
