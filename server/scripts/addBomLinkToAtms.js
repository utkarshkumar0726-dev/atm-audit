require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Atm } = require('../models');

const BOM_DOCUMENT_LINK = '/documents/BOM_Bill_of_Materials.docx';

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is missing in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  // Find ATMs without any link or empty links array
  const atmsWithoutLinks = await Atm.find({
    $and: [
      {
        $or: [
          { link: { $exists: false } },
          { link: null },
          { link: '' },
        ],
      },
      {
        $or: [
          { links: { $exists: false } },
          { links: null },
          { links: { $size: 0 } },
        ],
      },
    ],
  });

  console.log(`Found ${atmsWithoutLinks.length} ATMs without links.`);

  let updatedCount = 0;
  for (const atm of atmsWithoutLinks) {
    atm.link = BOM_DOCUMENT_LINK;
    atm.links = [BOM_DOCUMENT_LINK];
    await atm.save();
    updatedCount++;
    console.log(`[${updatedCount}/${atmsWithoutLinks.length}] Updated ${atm.atmId} with BOM link: ${BOM_DOCUMENT_LINK}`);
  }

  console.log(`\nSuccessfully updated ${updatedCount} ATMs with BOM Document Link!`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error updating ATM links:', err);
  process.exit(1);
});
