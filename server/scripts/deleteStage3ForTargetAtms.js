const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Audit } = require('../models');

async function main() {
  const targetIds = ['SPSBV010501', 'SPSBP001302', 'RPSBH048401'];
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // 1. Fetch current audits for backup
  const audits = await Audit.find({
    atmId: { $in: targetIds },
  });

  if (audits.length === 0) {
    console.error('No audits found for target IDs:', targetIds);
    process.exit(1);
  }

  // Save safety backup before deletion
  const backupDir = path.resolve(__dirname, '../../backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupPath = path.join(backupDir, `stage3_backup_${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(audits, null, 2));
  console.log(`Safety backup written to: ${backupPath}`);

  // 2. Clear Stage 3 data for each audit
  for (const audit of audits) {
    console.log(`\nProcessing ATM: ${audit.atmId} (Audit ID: ${audit._id})...`);

    const stage3 = (audit.stages || []).find((s, idx) => {
      const name = (s.stageName || '').toLowerCase();
      const id = (s.stageId || '').toString();
      return (
        name.includes('network') ||
        name.includes('cyber') ||
        name.includes('stage 3') ||
        idx === 2 ||
        id === '6ab11c238e311fa7a5a8cb8a'
      );
    });

    if (!stage3) {
      console.warn(`  Warning: Stage 3 not found in audit for ATM ${audit.atmId}`);
      continue;
    }

    const previousAnswersCount = (stage3.questions || []).filter((q) => q.answer === 'yes' || q.answer === 'no').length;
    console.log(`  Stage 3 "${stage3.stageName}": Cleared ${previousAnswersCount} answered questions.`);

    // Reset all questions in Stage 3 to blank
    stage3.questions = (stage3.questions || []).map((q) => ({
      ...q,
      answer: '',
      reason: '',
      photos: [],
    }));

    // Update audit status to in_progress and not completed
    audit.isCompleted = false;
    audit.status = 'in_progress';
    audit.completedAt = null;

    // Mark stages modified for Mongoose mixed array
    audit.markModified('stages');

    await audit.save();
    console.log(`  Updated audit for ${audit.atmId}: Stage 3 data cleared, status set to in_progress.`);
  }

  console.log('\n==================================================');
  console.log('VERIFYING AUDITS IN MONGODB:');
  console.log('==================================================');
  for (const id of targetIds) {
    const verified = await Audit.findOne({ atmId: id }).lean();
    if (!verified) continue;
    console.log(`ATM: ${verified.atmId} | isCompleted: ${verified.isCompleted} | status: ${verified.status}`);
    (verified.stages || []).forEach((st, idx) => {
      const answered = (st.questions || []).filter((q) => q.answer === 'yes' || q.answer === 'no').length;
      const total = st.questions?.length || 0;
      console.log(`  Stage ${idx + 1} (${st.stageName}): ${answered}/${total} answered`);
    });
  }

  await mongoose.disconnect();
  console.log('\nDone successfully!');
}

main().catch((err) => {
  console.error('Error during Stage 3 deletion:', err);
  process.exit(1);
});
