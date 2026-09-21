const express = require('express');
const { Stage, ChecklistQuestion } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/checklist - nested stages + questions, in order (any authenticated user)
router.get('/', requireAuth, async (req, res) => {
  try {
    const stages = await Stage.findAll({
      include: [
        {
          model: ChecklistQuestion,
          as: 'questions',
        },
      ],
      order: [
        ['order', 'ASC'],
        [{ model: ChecklistQuestion, as: 'questions' }, 'order', 'ASC'],
      ],
    });

    res.json(stages);
  } catch (err) {
    console.error('Fetch checklist error:', err);
    res.status(500).json({ message: 'Server error fetching checklist' });
  }
});

// POST /api/checklist/stages - admin adds a stage
router.post('/stages', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'name is required' });
    }
    const count = await Stage.count();
    const stage = await Stage.create({ name: name.trim(), order: count });
    res.status(201).json(stage);
  } catch (err) {
    console.error('Create stage error:', err);
    res.status(500).json({ message: 'Server error creating stage' });
  }
});

// PUT /api/checklist/stages/:id - admin renames/reorders a stage
router.put('/stages/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, order } = req.body;
    const stage = await Stage.findByPk(req.params.id);
    if (!stage) return res.status(404).json({ message: 'Stage not found' });

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: 'name cannot be empty' });
      stage.name = name.trim();
    }
    if (order !== undefined) stage.order = order;
    await stage.save();
    res.json(stage);
  } catch (err) {
    console.error('Update stage error:', err);
    res.status(500).json({ message: 'Server error updating stage' });
  }
});

// DELETE /api/checklist/stages/:id - admin deletes a stage and its questions
router.delete('/stages/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const stage = await Stage.findByPk(req.params.id);
    if (!stage) return res.status(404).json({ message: 'Stage not found' });

    await ChecklistQuestion.destroy({ where: { stageId: stage.id } });
    await stage.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete stage error:', err);
    res.status(500).json({ message: 'Server error deleting stage' });
  }
});

// POST /api/checklist/stages/:stageId/questions - admin adds a question to a stage
router.post('/stages/:stageId/questions', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'text is required' });
    }
    const stage = await Stage.findByPk(req.params.stageId);
    if (!stage) return res.status(404).json({ message: 'Stage not found' });

    const count = await ChecklistQuestion.count({ where: { stageId: stage.id } });
    const question = await ChecklistQuestion.create({ stageId: stage.id, text: text.trim(), order: count });
    res.status(201).json(question);
  } catch (err) {
    console.error('Create question error:', err);
    res.status(500).json({ message: 'Server error creating question' });
  }
});

// PUT /api/checklist/questions/:id - admin edits a question
router.put('/questions/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { text, order } = req.body;
    const question = await ChecklistQuestion.findByPk(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });

    if (text !== undefined) {
      if (!text.trim()) return res.status(400).json({ message: 'text cannot be empty' });
      question.text = text.trim();
    }
    if (order !== undefined) question.order = order;
    await question.save();
    res.json(question);
  } catch (err) {
    console.error('Update question error:', err);
    res.status(500).json({ message: 'Server error updating question' });
  }
});

// DELETE /api/checklist/questions/:id - admin deletes a question
router.delete('/questions/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const question = await ChecklistQuestion.findByPk(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });

    await question.destroy();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete question error:', err);
    res.status(500).json({ message: 'Server error deleting question' });
  }
});

module.exports = router;
