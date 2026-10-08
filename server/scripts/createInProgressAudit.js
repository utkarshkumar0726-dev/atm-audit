require('dotenv').config();
const mongoose = require('mongoose');
const { Audit, Atm, User, Stage, ChecklistQuestion } = require('../models');

const samplePhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function createInProgressAudit() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const auditor = await User.findOne({ username: 'jitender5353@gmail.com' });
  const atm = await Atm.findOne({ atmId: 'SPSBP001302' }).populate('area');
  if (!atm) throw new Error('ATM SPSBP001302 not found');

  const stage1 = await Stage.findOne({ name: /HARDWARE/i });
  const allQuestions = await ChecklistQuestion.find().sort({ order: 1 });
  const questions = allQuestions.filter((q) => String(q.stage) === String(stage1._id));

  // Only answer 5 out of 10 questions in Stage 1
  const formattedQuestions = questions.map((q, idx) => {
    if (idx < 5) {
      return {
        questionId: q._id.toString(),
        questionText: q.text,
        answer: 'yes',
        reason: '',
        photos: [],
      };
    }
    return {
      questionId: q._id.toString(),
      questionText: q.text,
      answer: '',
      reason: '',
      photos: [],
    };
  });

  const formattedStages = [
    {
      stageId: stage1._id.toString(),
      stageName: stage1.name,
      questions: formattedQuestions,
    },
  ];

  let audit = await Audit.findOne({ atmId: atm.atmId });
  if (!audit) {
    audit = new Audit({
      atmId: atm.atmId,
      area: atm.area?.name || atm.location || 'H BLOCK',
      auditor: auditor._id.toString(),
      photos: [samplePhoto],
      stages: formattedStages,
      isCompleted: false,
      status: 'in_progress',
    });
  } else {
    audit.auditor = auditor._id.toString();
    audit.stages = formattedStages;
    audit.photos = [samplePhoto];
    audit.isCompleted = false;
    audit.status = 'in_progress';
  }
  await audit.save();
  console.log('Saved IN-PROGRESS test audit for ATM:', atm.atmId, 'with Stage 1 questions:', formattedQuestions.length);

  await mongoose.disconnect();
}

createInProgressAudit().catch((err) => {
  console.error('Error creating in-progress audit:', err);
  process.exit(1);
});
