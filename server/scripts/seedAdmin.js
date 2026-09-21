require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB } = require('../config/db');
const { User } = require('../models');

async function seedAdmin() {
  await connectDB();

  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Administrator';

  if (!password) {
    console.error('ADMIN_PASSWORD is not set in .env');
    process.exit(1);
  }

  const existing = await User.findOne({ where: { username } });
  if (existing) {
    console.log(`Admin user "${username}" already exists. Nothing to do.`);
    process.exit(0);
  }

  const hashed = await bcrypt.hash(password, 10);
  await User.create({ name, username, password: hashed, role: 'admin' });

  console.log(`Admin user created: ${username}`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
