const mongoose = require('mongoose');
const { Audit } = require('../models');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/atm_audit');
  console.log('Connected to MongoDB');

  const audits = await Audit.find();
  console.log(`Total audits: ${audits.length}`);

  let updated = 0;
  for (const audit of audits) {
    const activeStages = (audit.stages || []).slice(0, 2);
    if (activeStages.length < 2) continue;

    const allAnswered = activeStages.every((st) => {
      return (
        Array.isArray(st.questions) &&
        st.questions.length > 0 &&
        st.questions.every((q) => {
          if (q.answer === 'yes') return true;
          if (q.answer === 'no') return Boolean(q.reason?.trim());
          return false;
        })
      );
    });

    if (allAnswered && (!audit.isCompleted || audit.status !== 'completed')) {
      audit.isCompleted = true;
      audit.status = 'completed';
      if (!audit.completedAt) audit.completedAt = audit.updatedAt || audit.createdAt || new Date();
      await audit.save();
      updated++;
    }
  }

  console.log(`Updated ${updated} audits to isCompleted: true.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
