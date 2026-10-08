require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');

async function exportDatabase() {
  try {
    await connectDB();
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const backupDir = path.resolve(__dirname, '..', '..', 'backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log('📦 Exporting collections from:', mongoose.connection.name);
    const summary = {};

    for (const c of collections) {
      const data = await db.collection(c.name).find({}).toArray();
      fs.writeFileSync(path.join(backupDir, `${c.name}.json`), JSON.stringify(data, null, 2));
      summary[c.name] = data.length;
      console.log(` ✅ ${c.name}: ${data.length} records exported`);
    }

    console.log('\n🎉 Export complete! Files saved in:', backupDir);
    process.exit(0);
  } catch (err) {
    console.error('Export failed:', err);
    process.exit(1);
  }
}

exportDatabase();
