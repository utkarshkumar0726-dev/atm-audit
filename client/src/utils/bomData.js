// Official Bill of Materials (BOM) list for ATM e-Surveillance Sites
export const BOM_ITEMS = [
  { id: 1, name: '32 Zone Alarm Panel', qty: 1 },
  { id: 2, name: 'Dual SIM 4G Internet Router/Modem', qty: 1 },
  { id: 3, name: 'Magnetic Contact Sensor', qty: 11 },
  { id: 4, name: 'Motion Sensor', qty: 1 },
  { id: 5, name: 'Vibration Sensor', qty: 1 },
  { id: 6, name: 'Thermal Sensor', qty: 1 },
  { id: 7, name: 'Metal Contact Sensor', qty: 5 },
  { id: 8, name: 'Panic Switch', qty: 2 },
  { id: 9, name: 'Hooter', qty: 1 },
  { id: 10, name: 'NVR Based Two-way Communication', qty: 1 },
  { id: 11, name: 'AI Edge Device with Speaker', qty: 1 },
  { id: 12, name: 'USB Speaker', qty: 1 },
  { id: 13, name: '12V 12Ah Battery Backup for CCTV & Other Alarms', qty: 6 },
  { id: 14, name: 'Glass Break Sensor', qty: 1 },
  { id: 15, name: 'Smoke Detector', qty: 2 },
  { id: 16, name: 'Data SIM', qty: 2 },
  { id: 17, name: 'DC Connector', qty: 4 },
  { id: 18, name: 'Calling SIM', qty: 1 },
  { id: 19, name: 'RJ45 Connector', qty: 10 },
  { id: 20, name: 'Patch Cord 1 Meter', qty: 4 },
  { id: 21, name: 'Antenna 18dB', qty: 1 },
  { id: 22, name: 'Cat-6 Cable', qty: 55 },
  { id: 23, name: '4 Core Cable', qty: 180 },
  { id: 24, name: 'Vandal Proof Dome IP Camera with SD Card Support', qty: 2 },
  { id: 25, name: 'Vandal Proof Bullet IP Camera with SD Card Support', qty: 1 },
  { id: 26, name: 'IP Hidden Camera with SD Card Support Vandal Proof', qty: 1 },
  { id: 27, name: '32 GB SD Card', qty: 4 },
  { id: 28, name: 'Termination Box (4x4)', qty: 2 },
  { id: 29, name: 'Weather Proof Termination Box (4x4)', qty: 2 },
  { id: 30, name: '8 Channel NVR', qty: 1 },
  { id: 31, name: '4 TB Hard Disk', qty: 1 },
  { id: 32, name: '5 Port Switch', qty: 1 },
  { id: 33, name: 'Mini UPS for Power Backup', qty: 1 },
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
 * Creates or restores standard 33 BOM items from existing audit/draft data
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
