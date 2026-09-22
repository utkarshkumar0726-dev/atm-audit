const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), username: user.username, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

// POST /api/auth/login - both auditors and admin use this
router.post('/login', async (req, res) => {
  try {
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
      user: { id: user._id, _id: user._id, name: user.name, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// GET /api/auth/me - current logged-in user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/auth/change-password - logged-in user (admin/auditor) updates their password
router.put('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ message: 'New password must be at least 4 characters long' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: 'Server error updating password' });
  }
});

// PUT /api/auth/profile - logged-in user updates their profile details (name, username, and optional password)
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, username, currentPassword, newPassword } = req.body;
    if (!name || !username) {
      return res.status(400).json({ message: 'Name and username are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const cleanUsername = username.toLowerCase().trim();
    if (cleanUsername !== user.username) {
      const existing = await User.findOne({ username: cleanUsername, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ message: 'Username is already taken by another account' });
      }
      user.username = cleanUsername;
    }

    user.name = name.trim();

    // If changing password as well
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required to change password' });
      }
      if (newPassword.length < 4) {
        return res.status(400).json({ message: 'New password must be at least 4 characters long' });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    const token = signToken(user);

    res.json({
      message: 'Account details updated successfully',
      token,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// POST /api/auth/auditors - admin creates a new auditor account
router.post('/auditors', requireAuth, requireRole('admin'), async (req, res) => {
  try {
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
      name: name.trim(),
      username: username.toLowerCase().trim(),
      password: hashed,
      role: 'auditor',
    });

    res.status(201).json({ id: user._id, _id: user._id, name: user.name, username: user.username, role: user.role });
  } catch (err) {
    console.error('Create auditor error:', err);
    res.status(500).json({ message: 'Server error creating auditor' });
  }
});

// GET /api/auth/auditors - admin lists all auditors
router.get('/auditors', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const auditors = await User.find({ role: 'auditor' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(auditors);
  } catch (err) {
    console.error('List auditors error:', err);
    res.status(500).json({ message: 'Server error fetching auditors' });
  }
});

// PUT /api/auth/auditors/:id - admin edits an auditor's name/username, optionally resets password
router.put('/auditors/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
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
      const existing = await User.findOne({
        username: normalizedUsername,
        _id: { $ne: auditor._id },
      });
      if (existing) {
        return res.status(409).json({ message: 'Username already taken' });
      }
    }

    auditor.name = name.trim();
    auditor.username = normalizedUsername;
    if (password) {
      auditor.password = await bcrypt.hash(password, 10);
    }
    await auditor.save();

    res.json({ id: auditor._id, _id: auditor._id, name: auditor.name, username: auditor.username, role: auditor.role });
  } catch (err) {
    console.error('Update auditor error:', err);
    res.status(500).json({ message: 'Server error updating auditor' });
  }
});

module.exports = router;
