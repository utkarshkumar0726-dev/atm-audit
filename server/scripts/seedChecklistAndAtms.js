require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Area = require('../models/Area');
const Atm = require('../models/Atm');
const Stage = require('../models/Stage');
const ChecklistQuestion = require('../models/ChecklistQuestion');

const AREA_NAMES = ['North Zone', 'South Zone', 'East Zone', 'West Zone', 'Central Zone'];

const CHECKLIST = [
  {
    stageName: 'Physical Security',
    questions: [
      'Is the ATM lobby CCTV camera functional?',
      'Is the ATM signage properly displayed?',
      'Is the fire extinguisher present and within expiry?',
      'Is the emergency contact number displayed inside the lobby?',
    ],
  },
  {
    stageName: 'Hardware & Software',
    questions: [
      'Is the ATM screen free of error messages?',
      'Is the card reader free of visible tampering (skimmer check)?',
      'Is the receipt printer functioning and stocked with paper?',
      'Is the antivirus/software up to date as per last known patch?',
    ],
  },
  {
    stageName: 'Cash & Compliance',
    questions: [
      'Does the cash balance match the last reconciliation report?',
      'Is the vault/cassette lock in working condition?',
      'Is the audit log register up to date?',
      'Are RBI/regulatory compliance stickers displayed?',
    ],
  },
];

async function seed() {
  await connectDB();

  if ((await Area.countDocuments()) === 0) {
    await Area.insertMany(AREA_NAMES.map((name) => ({ name })));
    console.log(`Seeded ${AREA_NAMES.length} areas`);
  } else {
    console.log('Areas already exist, skipping');
  }

  if ((await Atm.countDocuments()) === 0) {
    const areas = await Area.find();
    const atms = Array.from({ length: 100 }, (_, i) => {
      const area = areas[i % areas.length];
      const branchNumber = Math.floor(i / areas.length) + 1;
      return {
        atmId: `ATM-${1001 + i}`,
        area: area._id,
        location: `${area.name} - Branch ${branchNumber}`,
      };
    });
    await Atm.insertMany(atms);
    console.log(`Seeded ${atms.length} ATMs`);
  } else {
    console.log('ATMs already exist, skipping');
  }

  if ((await Stage.countDocuments()) === 0) {
    for (let i = 0; i < CHECKLIST.length; i++) {
      const { stageName, questions } = CHECKLIST[i];
      const stage = await Stage.create({ name: stageName, order: i });
      await ChecklistQuestion.insertMany(
        questions.map((text, qi) => ({ stage: stage._id, text, order: qi }))
      );
    }
    console.log(`Seeded ${CHECKLIST.length} stages with questions`);
  } else {
    console.log('Checklist stages already exist, skipping');
  }

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
