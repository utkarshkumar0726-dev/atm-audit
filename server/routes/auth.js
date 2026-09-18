const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

// POST /api/auth/login - both auditors and admin use this
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const user = await User.findOne({ username: username.toLowerCase().trim() });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user._id, name: user.name, username: user.username, role: user.role },
  });
});

// GET /api/auth/me - current logged-in user
router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

// POST /api/auth/auditors - admin creates a new auditor account
router.post('/auditors', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ message: 'name, username, and password are required' });
  }

  const existing = await User.findOne({ username: username.toLowerCase().trim() });
  if (existing) {
    return res.status(409).json({ message: 'Username already taken' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    username: username.toLowerCase().trim(),
    password: hashed,
    role: 'auditor',
  });

  res.status(201).json({ id: user._id, name: user.name, username: user.username, role: user.role });
});

// GET /api/auth/auditors - admin lists all auditors
router.get('/auditors', requireAuth, requireRole('admin'), async (req, res) => {
  const auditors = await User.find({ role: 'auditor' }).select('-password').sort({ createdAt: -1 });
  res.json(auditors);
});

// PUT /api/auth/auditors/:id - admin edits an auditor's name/username, optionally resets password
router.put('/auditors/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username) {
    return res.status(400).json({ message: 'name and username are required' });
  }

  const auditor = await User.findOne({ _id: req.params.id, role: 'auditor' });
  if (!auditor) {
    return res.status(404).json({ message: 'Auditor not found' });
  }

  const normalizedUsername = username.toLowerCase().trim();
  if (normalizedUsername !== auditor.username) {
    const existing = await User.findOne({ username: normalizedUsername });
    if (existing) {
      return res.status(409).json({ message: 'Username already taken' });
    }
  }

  auditor.name = name;
  auditor.username = normalizedUsername;
  if (password) {
    auditor.password = await bcrypt.hash(password, 10);
  }
  await auditor.save();

  res.json({ id: auditor._id, name: auditor.name, username: auditor.username, role: auditor.role });
});

module.exports = router;
