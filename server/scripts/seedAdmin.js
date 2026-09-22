require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const { User } = require('../models');

async function seedAdmin() {
  await connectDB();

  const accounts = [
    {
      name: process.env.ADMIN_NAME || 'Administrator',
      username: (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim(),
      password: process.env.ADMIN_PASSWORD || 'admin',
      role: 'admin',
    },
    {
      name: 'Demo Admin',
      username: 'demoadmin',
      password: 'demo@1234',
      role: 'admin',
    },
  ];

  for (const acc of accounts) {
    const existing = await User.findOne({ username: acc.username });
    if (existing) {
      console.log(`Admin user "${acc.username}" already exists. Updating password & role...`);
      existing.password = await bcrypt.hash(acc.password, 10);
      existing.role = 'admin';
      existing.name = acc.name;
      await existing.save();
    } else {
      const hashed = await bcrypt.hash(acc.password, 10);
      await User.create({
        name: acc.name,
        username: acc.username,
        password: hashed,
        role: 'admin',
      });
      console.log(`Admin user created: ${acc.username}`);
    }
  }

  await mongoose.connection.close();
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
