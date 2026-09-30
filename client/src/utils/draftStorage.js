// Robust Client-Side Persistent Draft Storage for ATM Audits
// Uses IndexedDB as primary storage (hundreds of MBs capacity) so that
// high-resolution photos, question answers, reasons, and state are preserved
// across browser refreshes, tab closures, and app restarts without running
// into localStorage's 5MB quota limit.

const DB_NAME = 'AtmAuditDraftDB';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

function getStorageKeys(userId, atmId) {
  const normUserId = String(userId || 'anonymous').trim();
  const keys = [`atm_audit_active_draft_${normUserId}`];
  if (atmId) {
    const normAtm = String(atmId).trim().toLowerCase();
    keys.unshift(`atm_audit_draft_${normUserId}_${normAtm}`);
  }
  return keys;
}

/**
 * Save audit draft to IndexedDB (and localStorage as secondary fallback).
 */
export async function saveDraftToStorage(userId, draft, atmId) {
  if (!userId || !draft) return false;
  const keys = getStorageKeys(userId, atmId || draft.selectedAtm?.atmId);

  const payload = {
    ...draft,
    savedAt: new Date().toISOString(),
  };

  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      // Save under both specific ATM key and active draft key
      keys.forEach((k) => store.put(payload, k));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
    return true;
  } catch (err) {
    console.warn('IndexedDB save failed, trying localStorage fallback:', err);
    try {
      localStorage.setItem(keys[0], JSON.stringify(payload));
      return true;
    } catch (lsErr) {
      console.warn('localStorage fallback also failed (likely quota exceeded):', lsErr);
      return false;
    }
  }
}

/**
 * Load draft from IndexedDB, falling back to localStorage.
 */
export async function loadDraftFromStorage(userId, atmId) {
  if (!userId) return null;
  const keys = getStorageKeys(userId, atmId);

  try {
    const db = await openDB();
    for (const key of keys) {
      const draft = await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
      if (draft) return draft;
    }
  } catch (err) {
    console.warn('IndexedDB load failed, falling back to localStorage:', err);
  }

  // Fallback to localStorage
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
  }

  // Also check old legacy key format
  try {
    const legacyRaw = localStorage.getItem(`atm-audit-draft-${userId}`);
    if (legacyRaw) return JSON.parse(legacyRaw);
  } catch {
    // ignore
  }

  return null;
}

/**
 * Clear draft from IndexedDB and localStorage after successful submit or manual reset.
 */
export async function clearDraftFromStorage(userId, atmId) {
  if (!userId) return;
  const keys = getStorageKeys(userId, atmId);
  keys.push(`atm-audit-draft-${userId}`);

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    keys.forEach((k) => {
      try {
        store.delete(k);
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }

  keys.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  });
}
