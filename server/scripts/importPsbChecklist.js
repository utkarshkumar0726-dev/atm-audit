require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { Stage, ChecklistQuestion } = require('../models');

async function importChecklist() {
  const filePath = path.resolve(__dirname, '..', '..', 'PSB_eSurveillance_Audit_Checklist.xlsx');
  if (!fs.existsSync(filePath)) {
    console.error(`Checklist file not found at: ${filePath}`);
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await connectDB();

  console.log(`Reading Excel file: ${filePath}...`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['Checklist'];
  if (!ws) {
    console.error('Sheet "Checklist" not found in workbook!');
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const sections = [];
  let currentSection = null;

  for (const r of rows) {
    if (!r || r.length === 0) continue;
    const first = r[0] ? String(r[0]).trim() : '';
    const second = r[1] ? String(r[1]).trim() : '';
    const fourth = r[3] ? String(r[3]).trim() : '';

    if (first.startsWith('A. ') || first.startsWith('B. ') || first.startsWith('C. ')) {
      currentSection = {
        name: first,
        questions: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (/^[A-Z]{2}-\d{2}$/.test(first) && second) {
      if (currentSection) {
        const fullText = `[${first}] ${second}${fourth ? ` (Verify: ${fourth})` : ''}`;
        currentSection.questions.push({
          code: first,
          text: fullText,
        });
      }
    }
  }

  console.log(`\nFound ${sections.length} stages in PSB Checklist:`);
  sections.forEach((s) => console.log(`- ${s.name}: ${s.questions.length} questions`));

  console.log('\n--- Wiping old dummy checklist from MongoDB ---');
  await ChecklistQuestion.deleteMany({});
  await Stage.deleteMany({});
  console.log('Cleared old stages and questions.');

  console.log('\n--- Seeding real PSB e-Surveillance stages & questions ---');
  let totalQuestions = 0;
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const stage = await Stage.create({
      name: sec.name,
      order: sIdx,
    });

    for (let qIdx = 0; qIdx < sec.questions.length; qIdx++) {
      await ChecklistQuestion.create({
        stage: stage._id,
        text: sec.questions[qIdx].text,
        order: qIdx,
      });
      totalQuestions++;
    }
    console.log(`✓ Created stage "${sec.name}" with ${sec.questions.length} questions`);
  }

  console.log(`\n======================================================`);
  console.log(`  SUCCESS: PSB CHECKLIST IMPORTED TO MONGODB`);
  console.log(`  Stages: ${sections.length} | Questions: ${totalQuestions}`);
  console.log(`======================================================\n`);

  await mongoose.connection.close();
  process.exit(0);
}

importChecklist().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
