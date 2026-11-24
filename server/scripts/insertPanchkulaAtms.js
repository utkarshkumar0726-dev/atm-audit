const mongoose = require('mongoose');
const { Atm, Area, Assignment, Audit } = require('../models');

const NEW_SITES = [
  {
    slNo: 102,
    atmId: 'SPSBV093901',
    bic: 'G0939',
    branchName: 'GHARAUNDA',
    inchargeName: 'VIPIN KUMAR',
    inchargeContact: '7982728868',
    inchargeDesig: 'IN CHARGE',
    address: 'RAILWAY ROAD GHARAUNDA',
    state: 'HARYANA',
    siteType: 'ONSITE',
    location: 'GHARAUNDA',
    vendor: 'CMS',
    docketNo: '131026/74659-C1',
    remarks: 'Live',
    finding: 'live',
    additionalContacts: [
      { name: 'TL: Raman Chaba', phone: '9855592266' },
      { name: 'TM: Swapnil Bais', phone: '9811339889' },
      { name: 'Engineer: Ramkesh Meena', phone: '9772798674' },
    ],
  },
  {
    slNo: 103,
    atmId: 'SPSBV022602',
    bic: 'P0226',
    branchName: 'G T ROAD PANIPAT',
    inchargeName: 'HARDEEPINDER SINGH',
    inchargeContact: '8054002322',
    inchargeDesig: 'IN CHARGE',
    address: 'G T ROAD PANIPAT',
    state: 'HARYANA',
    siteType: 'ONSITE',
    location: 'G T ROAD PANIPAT',
    vendor: 'CMS',
    docketNo: '141126/20703',
    remarks: 'live',
    finding: 'live',
    additionalContacts: [
      { name: 'TL: Raman Chaba', phone: '9855592266' },
      { name: 'TM: Swapnil Bais', phone: '9811339889' },
      { name: 'Engineer: Ramkesh Meena', phone: '9772798674' },
    ],
  },
  {
    slNo: 104,
    atmId: 'SPSBW167301',
    bic: 'P1673',
    branchName: 'MODEL TOWN PANIPAT',
    inchargeName: 'ABHISHEK',
    inchargeContact: '9729382966',
    inchargeDesig: 'IN CHARGE',
    address: '277 L (part) Model town panipat',
    state: 'HARYANA',
    siteType: 'ONSITE',
    location: 'MODEL TOWN PANIPAT',
    vendor: 'CMS',
    docketNo: '131026/74660-C1',
    remarks: 'live',
    finding: 'live',
    additionalContacts: [
      { name: 'TL: Raman Chaba', phone: '9855592266' },
      { name: 'TM: Swapnil Bais', phone: '9811339889' },
      { name: 'Engineer: Ramkesh Meena', phone: '9772798674' },
    ],
  },
  {
    slNo: 105,
    atmId: 'SPSBV112601',
    bic: 'S1126',
    branchName: 'SAMALKHA',
    inchargeName: 'RAKESH KUMAR',
    inchargeContact: '8728007920',
    inchargeDesig: 'IN CHARGE',
    address: 'BENIWAL COMPLEX G T ROAD SAMALKHA',
    state: 'HARYANA',
    siteType: 'ONSITE',
    location: 'SAMALKHA',
    vendor: 'CMS',
    docketNo: '131026/74833-C2',
    remarks: 'live',
    finding: 'live',
    additionalContacts: [
      { name: 'TL: Raman Chaba', phone: '9855592266' },
      { name: 'TM: Swapnil Bais', phone: '9811339889' },
      { name: 'Engineer: Ramkesh Meena', phone: '9772798674' },
    ],
  },
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/atm_audit');
  console.log('Connected to MongoDB');

  const beforeCount = await Atm.countDocuments();
  console.log(`Current Total ATMs: ${beforeCount}`);

  // 1. Get or Create PANCHKULA Area
  let panchkulaArea = await Area.findOne({ name: 'PANCHKULA' });
  if (!panchkulaArea) {
    panchkulaArea = await Area.create({ name: 'PANCHKULA' });
    console.log(`Created Area: PANCHKULA (${panchkulaArea._id})`);
  } else {
    console.log(`Found Area: PANCHKULA (${panchkulaArea._id})`);
  }

  const jitenderId = '6ab360773a16ca44b477fea4';
  const rajanId = '6ab360c720f393f23084cf03';

  // 2. Insert new sites
  let inserted = 0;
  for (const site of NEW_SITES) {
    let atm = await Atm.findOne({ atmId: site.atmId });
    if (!atm) {
      atm = new Atm({
        ...site,
        area: panchkulaArea._id,
      });
      await atm.save();
      inserted++;
      console.log(`✓ Inserted new ATM: ${site.atmId} - ${site.branchName}`);
    } else {
      console.log(`ATM ${site.atmId} already exists, updating details...`);
      Object.assign(atm, site);
      atm.area = panchkulaArea._id;
      await atm.save();
    }

    // 3. Assign to auditors Jitender & Rajan
    for (const auditorId of [jitenderId, rajanId]) {
      const existing = await Assignment.findOne({ auditor: auditorId, atm: atm._id });
      if (!existing) {
        await Assignment.create({ auditor: auditorId, atm: atm._id });
        console.log(`  -> Assigned ${site.atmId} to auditor ${auditorId}`);
      }
    }
  }

  const afterCount = await Atm.countDocuments();
  console.log(`New Total ATMs in DB: ${afterCount} (Inserted: ${inserted})`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
