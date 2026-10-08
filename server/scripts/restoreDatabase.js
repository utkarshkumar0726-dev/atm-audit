require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Can pass target MongoDB URI as CLI arg:
// node scripts/restoreDatabase.js "mongodb://user:pass@vps-ip:27017/atm_audit"
async function restoreDatabase() {
  const targetUri = process.argv[2] || process.env.MONGO_URI;

  if (!targetUri) {
    console.error('❌ Error: No MongoDB URI specified.');
    console.log('Usage: node scripts/restoreDatabase.js "<TARGET_MONGO_URI>"');
    process.exit(1);
  }

  console.log('🔌 Connecting to target MongoDB:');
  console.log('   URI:', targetUri.replace(/:([^:@]{3,})@/, ':****@'));

  try {
    await mongoose.connect(targetUri);
    console.log('✅ Connected successfully!');

    const db = mongoose.connection.db;
    const backupDir = path.resolve(__dirname, '..', '..', 'backup');

    if (!fs.existsSync(backupDir)) {
      console.error('❌ Backup directory not found at:', backupDir);
      console.log('Please run `npm run db:export` first.');
      process.exit(1);
    }

    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json'));
    console.log(`\n📂 Found ${files.length} backup files to restore...`);

    for (const f of files) {
      const colName = f.replace('.json', '');
      const raw = fs.readFileSync(path.join(backupDir, f), 'utf8');
      const docs = JSON.parse(raw);

      if (Array.isArray(docs) && docs.length > 0) {
        // Clear existing in target collection before restoring
        await db.collection(colName).deleteMany({});
        await db.collection(colName).insertMany(docs);
        console.log(` ✅ Restored ${docs.length} documents into "${colName}"`);
      } else {
        console.log(` ℹ️ Skipped "${colName}" (empty)`);
      }
    }

    console.log('\n🎉 Database restoration completed successfully!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Restore failed:', err.message);
    process.exit(1);
  }
}

restoreDatabase();
