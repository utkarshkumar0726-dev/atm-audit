require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { Atm, Area } = require('../models');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is missing in .env');
    process.exit(1);
  }

  const excelPath = path.resolve(__dirname, '..', '..', 'CMS SITES FOR AUDITING revised.xlsx');
  if (!fs.existsSync(excelPath)) {
    console.error('Excel file not found at:', excelPath);
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const wb = XLSX.readFile(excelPath);
  const sheetName = wb.SheetNames.find((s) => s.toUpperCase() === 'CMS') || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  console.log(`Reading sheet "${sheetName}" (${rows.length} rows)...`);

  // Parse rows (Row 0 is title, Row 1 is header, data starts at Row 2)
  const excelAtms = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[1]) continue;

    const slNo = Number(r[0]) || excelAtms.length + 1;
    const atmId = String(r[1]).trim();
    const bic = r[2] ? String(r[2]).trim() : '';
    const branchName = r[3] ? String(r[3]).trim() : '';
    const inchargeName = r[4] ? String(r[4]).trim() : '';
    const inchargeDesig = r[5] ? String(r[5]).trim() : '';
    const inchargeContact = r[6] ? String(r[6]).trim() : '';
    const zone = r[7] ? String(r[7]).trim().toUpperCase() : 'GENERAL';
    const address = r[8] ? String(r[8]).trim() : '';
    const state = r[9] ? String(r[9]).trim() : '';
    const siteType = r[10] ? String(r[10]).trim() : 'ONSITE';

    excelAtms.push({
      slNo,
      atmId,
      bic,
      branchName,
      inchargeName,
      inchargeDesig,
      inchargeContact,
      zone,
      address,
      state,
      siteType,
    });
  }

  console.log(`Found ${excelAtms.length} CMS ATM rows to update.`);

  // Ensure Areas
  const existingAreas = await Area.find();
  const areaMap = new Map();
  for (const a of existingAreas) {
    areaMap.set(a.name.toUpperCase().trim(), a._id);
  }

  const BOM_LINK = '/documents/BOM_Bill_of_Materials.docx';
  let updatedCount = 0;
  let createdCount = 0;

  for (const item of excelAtms) {
    let areaId = areaMap.get(item.zone);
    if (!areaId) {
      const createdArea = await Area.create({ name: item.zone });
      areaId = createdArea._id;
      areaMap.set(item.zone, areaId);
      console.log(`Created new area: ${item.zone}`);
    }

    let atm = await Atm.findOne({ atmId: item.atmId });

    if (atm) {
      const changes = [];
      if (atm.inchargeName !== item.inchargeName) changes.push(`incharge: "${atm.inchargeName}" -> "${item.inchargeName}"`);
      if (atm.inchargeContact !== item.inchargeContact) changes.push(`contact: "${atm.inchargeContact}" -> "${item.inchargeContact}"`);
      if (atm.inchargeDesig !== item.inchargeDesig) changes.push(`desig: "${atm.inchargeDesig}" -> "${item.inchargeDesig}"`);
      if (atm.branchName !== item.branchName) changes.push(`branch: "${atm.branchName}" -> "${item.branchName}"`);
      if (atm.address !== item.address) changes.push(`address changed`);
      if (String(atm.area) !== String(areaId)) changes.push(`area: "${item.zone}"`);

      atm.slNo = item.slNo;
      atm.vendor = 'CMS';
      atm.bic = item.bic;
      atm.branchName = item.branchName;
      atm.inchargeName = item.inchargeName;
      atm.inchargeDesig = item.inchargeDesig;
      atm.inchargeContact = item.inchargeContact;
      atm.area = areaId;
      atm.address = item.address;
      atm.state = item.state;
      atm.siteType = item.siteType;
      atm.location = item.branchName || item.address;

      if (!atm.link) atm.link = BOM_LINK;
      if (!atm.links || atm.links.length === 0) atm.links = [BOM_LINK];

      await atm.save();
      updatedCount++;
      console.log(`[UPDATED] ${item.slNo}. ${item.atmId} (${item.branchName})${changes.length ? ` - ${changes.join(', ')}` : ' (verified up-to-date)'}`);
    } else {
      atm = await Atm.create({
        slNo: item.slNo,
        atmId: item.atmId,
        area: areaId,
        vendor: 'CMS',
        bic: item.bic,
        branchName: item.branchName,
        inchargeName: item.inchargeName,
        inchargeDesig: item.inchargeDesig,
        inchargeContact: item.inchargeContact,
        address: item.address,
        state: item.state,
        siteType: item.siteType,
        location: item.branchName || item.address,
        link: BOM_LINK,
        links: [BOM_LINK],
        additionalContacts: [],
      });
      createdCount++;
      console.log(`[CREATED] ${item.slNo}. ${item.atmId} (${item.branchName})`);
    }
  }

  console.log(`\n========================================`);
  console.log(`CMS Sites update completed successfully!`);
  console.log(`Updated: ${updatedCount} | Created: ${createdCount} | Total: ${excelAtms.length}`);
  console.log(`========================================`);

  // Export updated database to backup/atms.json
  const backupPath = path.resolve(__dirname, '..', '..', 'backup', 'atms.json');
  const allAtms = await Atm.find().lean();
  fs.writeFileSync(backupPath, JSON.stringify(allAtms, null, 2));
  console.log(`Updated ${backupPath} (${allAtms.length} records).`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error updating CMS sites:', err);
  process.exit(1);
});
