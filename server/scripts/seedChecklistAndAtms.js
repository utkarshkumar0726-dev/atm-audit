require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { Stage, ChecklistQuestion } = require('../models');

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

  const stageCount = await Stage.countDocuments();
  if (stageCount === 0) {
    for (let i = 0; i < CHECKLIST.length; i++) {
      const { stageName, questions } = CHECKLIST[i];
      const stage = await Stage.create({ name: stageName, order: i });
      for (let qi = 0; qi < questions.length; qi++) {
        await ChecklistQuestion.create({
          stage: stage._id,
          text: questions[qi],
          order: qi,
        });
      }
    }
    console.log(`Seeded ${CHECKLIST.length} stages with questions in MongoDB`);
  } else {
    console.log('Checklist stages already exist in MongoDB, skipping');
  }

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});
