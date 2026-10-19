// Official Bill of Materials (BOM) list for ATM E-surveillance Solution
export const BOM_ITEMS = [
  {
    id: 1,
    name: 'Integrated Digital Unit Box- (Empty)-Ivis-New Version',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 2,
    name: 'ATM/CRM Chest Door sensor with Magnet',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 3,
    name: 'ATM/CRM Hood Door sensor with Magnet',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 4,
    name: 'ATM/CRM Vibration sensor with Magnet',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 5,
    name: 'ATM/CRM Floor sensor with Magnet',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 6,
    name: 'Wireless Ups Power On/Off Sensor',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 7,
    name: 'Shutter Sensor',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 8,
    name: 'Shutter Lock Sensor Enclosure',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 9,
    name: 'ATM Back Room Door Sensor',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 10,
    name: 'Unit/ Panel Security Enclosure Tamper Sensor',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 11,
    name: '26 AH Battery & 12 V Charger (IVIS) Mini UPS Built in Internal SMPS and Battery with minimum 12 Hours back up',
    desc: 'IVIS & Exide/Reputed',
    qty: 1,
  },
  {
    id: 12,
    name: '8 Channel NVR',
    desc: 'Sparsh/STQC Model',
    qty: 1,
  },
  {
    id: 13,
    name: '4TB HDD',
    desc: 'Seagate/WD/Toshiba',
    qty: 1,
  },
  {
    id: 14,
    name: '8 Port Poe Switch',
    desc: 'Fyber/Dlink/Reputed',
    qty: 1,
  },
  {
    id: 15,
    name: '4G Patch Antenna',
    desc: 'IVIS/Reputed',
    qty: 2,
  },
  {
    id: 16,
    name: '2 MP IP Dome IR Vandal Proof Camera - Front Lobby',
    desc: 'Sparsh/STQC Model',
    qty: 1,
  },
  {
    id: 17,
    name: '2 MP IP Bullet IR Vandal Proof Camera-Outside ATM room',
    desc: 'Sparsh/STQC Model',
    qty: 1,
  },
  {
    id: 18,
    name: '2 MP IP Hidden/Pinhole Vandal Proof Camera with mirror',
    desc: 'Sparsh/STQC Model',
    qty: 1,
  },
  {
    id: 19,
    name: '2 MP IP IR Vandal Proof Camera Back Room',
    desc: 'Sparsh/STQC Model',
    qty: 1,
  },
  {
    id: 20,
    name: 'Two Way Audio speaker with inbuilt SIREN/ HOOTER',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 21,
    name: '32 SD cards 1 for each camera',
    desc: 'SanDisk/Reputed',
    qty: 4,
  },
  {
    id: 22,
    name: 'Glass Break Sensor',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 23,
    name: 'PIR Detector Motion Sensor/ Occupancy Sensor',
    desc: 'Securico/Reputed',
    qty: 1,
  },
  {
    id: 24,
    name: 'Panic Switch',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 25,
    name: 'Fire/Smoke Detector Lobby & Backroom',
    desc: 'Ravel/ Reputed',
    qty: 1,
  },
  {
    id: 26,
    name: 'Magnetic Removal Sensors for Cameras/AC/ Two-way speaker (1 for Each camera, 1 for AC, 1-Two-way speaker)',
    desc: 'IVIS',
    qty: 7,
  },
  {
    id: 27,
    name: 'Communication equipment with GSM /VPN/ multi-SIM inbuilt router with Bandwidth aggregator IPCB Board',
    desc: 'IVIS',
    qty: 1,
  },
  {
    id: 28,
    name: 'Data sim',
    desc: 'Airtel/Jio',
    qty: 2,
  },
  {
    id: 29,
    name: '6X6 Inch Junction Box - PVC',
    desc: 'Reputed',
    qty: 4,
  },
];

/**
 * Checks if a checklist question is the BOM verification question [HW-01]
 */
export function isBomQuestion(q) {
  if (!q) return false;
  const text = (q.questionText || q.text || '').toLowerCase();
  const code = (q.code || '').toLowerCase();
  return (
    code === 'hw-01' ||
    text.includes('[hw-01]') ||
    (text.includes('bom') && (text.includes('equipment') || text.includes('approved site list')))
  );
}

/**
 * Creates or restores standard 29 BOM items from existing audit/draft data
 */
export function createDefaultBomItems(existingItems = null) {
  const existingMap = new Map();
  if (Array.isArray(existingItems)) {
    existingItems.forEach((item) => {
      if (item && item.id != null) existingMap.set(Number(item.id), item);
      if (item && item.name) existingMap.set(item.name.toLowerCase().trim(), item);
    });
  }

  return BOM_ITEMS.map((base) => {
    const existing = existingMap.get(base.id) || existingMap.get(base.name.toLowerCase().trim());
    return {
      id: base.id,
      name: base.name,
      desc: base.desc || '',
      qty: base.qty,
      status: existing?.status || '', // 'yes' | 'no' | ''
      remark: existing?.remark || '',
    };
  });
}

/**
 * Computes statistics for a BOM items array
 */
export function getBomSummary(bomItems) {
  if (!Array.isArray(bomItems) || bomItems.length === 0) {
    return { total: BOM_ITEMS.length, answered: 0, yesCount: 0, noCount: 0, missingItems: [] };
  }
  let answered = 0;
  let yesCount = 0;
  let noCount = 0;
  const missingItems = [];

  bomItems.forEach((item) => {
    if (item.status === 'yes') {
      answered++;
      yesCount++;
    } else if (item.status === 'no') {
      answered++;
      noCount++;
      missingItems.push(item);
    }
  });

  return {
    total: bomItems.length,
    answered,
    yesCount,
    noCount,
    missingItems,
    isAllYes: answered === bomItems.length && noCount === 0,
    hasNo: noCount > 0,
  };
}
