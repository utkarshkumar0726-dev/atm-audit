const express = require('express');
const Stage = require('../models/Stage');
const ChecklistQuestion = require('../models/ChecklistQuestion');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/checklist - nested stages + questions, in order (any authenticated user)
router.get('/', requireAuth, async (req, res) => {
  const stages = await Stage.find().sort({ order: 1 });
  const questions = await ChecklistQuestion.find().sort({ order: 1 });

  const result = stages.map((stage) => ({
    _id: stage._id,
    name: stage.name,
    order: stage.order,
    questions: questions.filter((q) => q.stage.toString() === stage._id.toString()),
  }));

  res.json(result);
});

// POST /api/checklist/stages - admin adds a stage
router.post('/stages', requireAuth, requireRole('admin'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'name is required' });
  }
  const count = await Stage.countDocuments();
  const stage = await Stage.create({ name: name.trim(), order: count });
  res.status(201).json(stage);
});

// PUT /api/checklist/stages/:id - admin renames/reorders a stage
router.put('/stages/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, order } = req.body;
  const stage = await Stage.findById(req.params.id);
  if (!stage) return res.status(404).json({ message: 'Stage not found' });

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ message: 'name cannot be empty' });
    stage.name = name.trim();
  }
  if (order !== undefined) stage.order = order;
  await stage.save();
  res.json(stage);
});

// DELETE /api/checklist/stages/:id - admin deletes a stage and its questions
router.delete('/stages/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const stage = await Stage.findByIdAndDelete(req.params.id);
  if (!stage) return res.status(404).json({ message: 'Stage not found' });
  await ChecklistQuestion.deleteMany({ stage: stage._id });
  res.json({ message: 'Deleted' });
});

// POST /api/checklist/stages/:stageId/questions - admin adds a question to a stage
router.post('/stages/:stageId/questions', requireAuth, requireRole('admin'), async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ message: 'text is required' });
  }
  const stage = await Stage.findById(req.params.stageId);
  if (!stage) return res.status(404).json({ message: 'Stage not found' });

  const count = await ChecklistQuestion.countDocuments({ stage: stage._id });
  const question = await ChecklistQuestion.create({ stage: stage._id, text: text.trim(), order: count });
  res.status(201).json(question);
});

// PUT /api/checklist/questions/:id - admin edits a question
router.put('/questions/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { text, order } = req.body;
  const question = await ChecklistQuestion.findById(req.params.id);
  if (!question) return res.status(404).json({ message: 'Question not found' });

  if (text !== undefined) {
    if (!text.trim()) return res.status(400).json({ message: 'text cannot be empty' });
    question.text = text.trim();
  }
  if (order !== undefined) question.order = order;
  await question.save();
  res.json(question);
});

// DELETE /api/checklist/questions/:id - admin deletes a question
router.delete('/questions/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const question = await ChecklistQuestion.findByIdAndDelete(req.params.id);
  if (!question) return res.status(404).json({ message: 'Question not found' });
  res.json({ message: 'Deleted' });
});

module.exports = router;
