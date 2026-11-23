const mongoose = require('mongoose');
const { Atm, Area, Assignment, Audit } = require('../models');

const SITES_TO_UPDATE = [
  {
    atmId: 'SPSBW031001',
    bic: 'S0310',
    branchName: 'SONIPAT',
    inchargeName: 'RAJESH SAINI',
    inchargeDesig: 'SENIOR MANAGER- IN CHARGE',
    inchargeContact: '9548021787',
    address: 'GEETA BHAVAN CHOWK, NEAR BANK OF INDIA SONIPAT, HARYANA',
    state: 'HARYANA',
    siteType: 'ONSITE',
    location: 'SONIPAT',
    vendor: 'CMS',
    docketNo: '131026/74754-C3',
    remarks: 'site is down due power issue at site // part also gone faulty',
    finding: 'offline',
    additionalContacts: [
      { name: 'TL: Mayank Rastogi', phone: '8756998026' },
      { name: 'TM: Swapnil Bais', phone: '9811339889' },
      { name: 'Engineer: vikas gupta', phone: '8252691619' },
    ],
  },
  {
    atmId: 'SPSBW125601',
    bic: 'B1256',
    branchName: 'BAHADURGARH',
    inchargeName: 'SAURABH MOTWANI',
    inchargeDesig: 'SENIOR MANAGER- IN CHARGE',
    inchargeContact: '9654652567',
    address: 'NEAR CIVIL HOSPITAL , BAHADURGARH ,HARYANA',
    state: 'HARYANA',
    siteType: 'ONSITE',
    location: 'BAHADURGARH',
    vendor: 'CMS',
    docketNo: '-',
    remarks: 'Spare part fault electricial issue ETA awaited',
    finding: 'offline',
    additionalContacts: [
      { name: 'TL: Raman Chaba', phone: '9855592266' },
      { name: 'TM: Swapnil Bais', phone: '9811339889' },
    ],
  },
  {
    atmId: 'SPSBV153401',
    bic: 'J1534',
    branchName: 'JHAJJAR',
    inchargeName: 'HARISH CHAND',
    inchargeDesig: 'SENIOR MANAGER- IN CHARGE',
    inchargeContact: '9599947461',
    address: 'JMD-2 COMPLEX, NEAR YADAV DHARMSHALA , JHAJJAR ,HARYANA',
    state: 'HARYANA',
    siteType: 'ONSITE',
    location: 'JHAJJAR',
    vendor: 'CMS',
    docketNo: '-',
    remarks: 'Spare part fault electricial issue/Site dismantle by customer, Refer attached mail, Still the missing spares chargeable basis approval & require spares to complete the reinstallation not have arrange. Without arranging of spares site cannot be reinstalled.',
    finding: 'Installation pending',
    additionalContacts: [
      { name: 'TL: Raman Chaba', phone: '9855592266' },
      { name: 'TM: Swapnil Bais', phone: '9811339889' },
    ],
  },
  {
    atmId: 'SPSBP028001',
    bic: 'R0280',
    branchName: 'ROHTAK',
    inchargeName: 'HARISH KUMAR MADAN',
    inchargeDesig: 'SENIOR MANAGER- IN CHARGE',
    inchargeContact: '7206023500',
    address: 'BHIWANI STAND ROHTAK , HARYANA',
    state: 'HARYANA',
    siteType: 'ONSITE',
    location: 'ROHTAK',
    vendor: 'CMS',
    docketNo: '-',
    remarks: 'site under process while bank given site ready on 4 nov 2026',
    finding: 'offline',
    additionalContacts: [
      { name: 'TL: Raman Chaba', phone: '9855592266' },
      { name: 'TM: Swapnil Bais', phone: '9811339889' },
    ],
  },
];

// Preserved old audited sites list to make sure we NEVER touch them
const PRESERVED_AUDITED_SITES = [
  'SPSBW144901', // SAFIDON
  'SPSBV100101', // JIND
  'SPSBV163001', // Charkhi Dadri
  'SPSBW150801', // SUBHAS ROAD, ROHTAK
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/atm_audit');
  console.log('Connected to MongoDB');

  // Verify preserved audited sites
  for (const aid of PRESERVED_AUDITED_SITES) {
    const audit = await Audit.findOne({ atmId: aid });
    console.log(`[PRESERVED] Site ${aid} has audit: ${audit ? audit.status : 'none'}. (Will NOT be modified)`);
  }

  // Find GURUGRAM area
  let area = await Area.findOne({ name: 'GURUGRAM' });
  if (!area) {
    area = await Area.create({ name: 'GURUGRAM' });
  }

  const jitenderId = '6ab360773a16ca44b477fea4';
  const rajanId = '6ab360c720f393f23084cf03';

  for (const site of SITES_TO_UPDATE) {
    let atm = await Atm.findOne({ atmId: site.atmId });
    if (!atm) {
      console.log(`Creating new ATM ${site.atmId}...`);
      atm = new Atm({
        ...site,
        area: area._id,
      });
      await atm.save();
    } else {
      console.log(`Updating existing ATM ${site.atmId}...`);
      atm.bic = site.bic;
      atm.branchName = site.branchName;
      atm.inchargeName = site.inchargeName;
      atm.inchargeDesig = site.inchargeDesig;
      atm.inchargeContact = site.inchargeContact;
      atm.address = site.address;
      atm.state = site.state;
      atm.siteType = site.siteType;
      atm.location = site.location;
      atm.vendor = site.vendor;
      atm.docketNo = site.docketNo;
      atm.remarks = site.remarks;
      atm.finding = site.finding;
      atm.additionalContacts = site.additionalContacts;
      atm.area = area._id;
      await atm.save();
    }

    // Ensure assignments for active auditors
    for (const auditorId of [jitenderId, rajanId]) {
      const existingAssignment = await Assignment.findOne({ auditor: auditorId, atm: atm._id });
      if (!existingAssignment) {
        await Assignment.create({ auditor: auditorId, atm: atm._id });
        console.log(`  -> Assigned ${site.atmId} to auditor ${auditorId}`);
      }
    }

    console.log(`✓ Site ${site.atmId} (${site.branchName}) ready with full contact and docket info.`);
  }

  console.log('Update completed successfully. ZERO audits were touched or deleted.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
