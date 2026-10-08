require('dotenv').config();
const mongoose = require('mongoose');
const { Audit, Atm, User, Stage, ChecklistQuestion, AuditLog } = require('../models');

const samplePhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function createTestAudit() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const auditor = await User.findOne({ username: 'jitender5353@gmail.com' });
  if (!auditor) throw new Error('Auditor not found');

  const atm = await Atm.findOne({ atmId: 'SPSBV000701' }).populate('area');
  if (!atm) throw new Error('ATM SPSBV000701 not found');

  const stagesInDb = await Stage.find().sort({ order: 1 });
  const allQuestions = await ChecklistQuestion.find().sort({ order: 1 });
  const formattedStages = [];

  for (const st of stagesInDb) {
    const questions = allQuestions.filter((q) => String(q.stage) === String(st._id));
    const formattedQuestions = questions.map((q, idx) => {
      // In Stage 2, question 4 answer 'no' with a valid reason
      const isStage2Q4 = st.name.includes('FUNCTIONAL') && idx === 3;
      if (isStage2Q4) {
        return {
          questionId: q._id.toString(),
          questionText: q.text,
          answer: 'no',
          reason: 'UPS battery backup lasted 2.5 hours under load test (expected 4 hours). Escalated to vendor for replacement.',
          photos: [samplePhoto],
        };
      }
      return {
        questionId: q._id.toString(),
        questionText: q.text,
        answer: 'yes',
        reason: '',
        photos: [],
      };
    });

    formattedStages.push({
      stageId: st._id.toString(),
      stageName: st.name,
      questions: formattedQuestions,
    });
  }

  // Update or insert audit for SPSBV000701
  let audit = await Audit.findOne({ atmId: atm.atmId });
  if (!audit) {
    audit = new Audit({
      atmId: atm.atmId,
      area: atm.area?.name || atm.location || 'CHANDNI CHOWK, DELHI',
      auditor: auditor._id.toString(),
      photos: [samplePhoto],
      stages: formattedStages,
      isCompleted: true,
      completedAt: new Date(),
      status: 'completed',
    });
  } else {
    audit.auditor = auditor._id.toString();
    audit.stages = formattedStages;
    audit.photos = [samplePhoto];
    audit.isCompleted = true;
    audit.completedAt = new Date();
    audit.status = 'completed';
  }
  await audit.save();
  console.log('Saved COMPLETE test audit for ATM:', atm.atmId, 'with stages:', formattedStages.length);
  formattedStages.forEach((s) => console.log(' -', s.stageName, 'Questions:', s.questions.length));

  await mongoose.disconnect();
}

createTestAudit().catch((err) => {
  console.error('Error creating test audit:', err);
  process.exit(1);
});
