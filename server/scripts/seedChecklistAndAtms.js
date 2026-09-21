require('dotenv').config();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { Stage, ChecklistQuestion } = require('../models');

async function seed() {
  await connectDB();

  const stageCount = await Stage.countDocuments();
  if (stageCount === 0) {
    const filePath = path.resolve(__dirname, '..', '..', 'PSB_eSurveillance_Audit_Checklist.xlsx');
    if (fs.existsSync(filePath)) {
      const wb = XLSX.readFile(filePath);
      const ws = wb.Sheets['Checklist'];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const sections = [];
      let currentSection = null;

      for (const r of rows) {
        if (!r || r.length === 0) continue;
        const first = r[0] ? String(r[0]).trim() : '';
        const second = r[1] ? String(r[1]).trim() : '';
        const fourth = r[3] ? String(r[3]).trim() : '';

        if (first.startsWith('A. ') || first.startsWith('B. ') || first.startsWith('C. ')) {
          currentSection = { name: first, questions: [] };
          sections.push(currentSection);
          continue;
        }

        if (/^[A-Z]{2}-\d{2}$/.test(first) && second) {
          if (currentSection) {
            const fullText = `[${first}] ${second}${fourth ? ` (Verify: ${fourth})` : ''}`;
            currentSection.questions.push(fullText);
          }
        }
      }

      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const sec = sections[sIdx];
        const stage = await Stage.create({ name: sec.name, order: sIdx });
        for (let qIdx = 0; qIdx < sec.questions.length; qIdx++) {
          await ChecklistQuestion.create({
            stage: stage._id,
            text: sec.questions[qIdx],
            order: qIdx,
          });
        }
      }
      console.log(`Seeded ${sections.length} PSB stages with questions in MongoDB`);
    }
  } else {
    console.log(`Checklist stages already exist (${stageCount} stages) in MongoDB, skipping`);
  }

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});
