// Robust Client + Cloud Persistent Draft Storage for ATM Audits
// 1. Uses IndexedDB locally (hundreds of MBs capacity) for instantaneous offline & refresh recovery.
// 2. Syncs with MongoDB Server (/api/audits/draft) so that photos taken on a phone
//    are instantly accessible when logging in on a laptop/desktop with the same auditor account!

import api from '../api/client';

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
  if (atmId) {
    const normAtm = String(atmId).trim().toLowerCase();
    // When requesting a specific ATM, ONLY check keys dedicated to that ATM!
    return [`atm_audit_draft_${normUserId}_${normAtm}`];
  }
  return [`atm_audit_active_draft_${normUserId}`];
}

function isDraftForAtm(draft, targetAtmId) {
  if (!draft) return false;
  if (!targetAtmId) return true;
  const target = String(targetAtmId).trim().toLowerCase();
  const draftAtm = String(draft.selectedAtm?.atmId || draft.atmId || '').trim().toLowerCase();
  return draftAtm === target;
}

/**
 * Save audit draft to local IndexedDB and sync to cloud server (MongoDB).
 */
export async function saveDraftToStorage(userId, draft, atmId) {
  if (!userId || !draft) return false;
  const targetAtmId = (atmId || draft.selectedAtm?.atmId || '').trim();
  const normUserId = String(userId || 'anonymous').trim();

  // Keys to write: specific ATM key AND active draft key
  const writeKeys = [`atm_audit_active_draft_${normUserId}`];
  if (targetAtmId) {
    writeKeys.unshift(`atm_audit_draft_${normUserId}_${targetAtmId.toLowerCase()}`);
  }

  const payload = {
    ...draft,
    savedAt: new Date().toISOString(),
  };

  // 1. Save locally in IndexedDB (instant, zero delay)
  let localSaved = false;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      writeKeys.forEach((k) => store.put(payload, k));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
    localSaved = true;
  } catch (err) {
    console.warn('IndexedDB save failed, trying localStorage fallback:', err);
    try {
      localStorage.setItem(writeKeys[0], JSON.stringify(payload));
      localSaved = true;
    } catch (lsErr) {
      console.warn('localStorage fallback failed:', lsErr);
    }
  }

  // 2. Sync to Server (MongoDB) for cross-device support (Phone <-> Laptop)
  try {
    await api.post('/audits/draft', {
      selectedAtm: draft.selectedAtm,
      photos: draft.photos || [],
      stages: draft.stages || [],
      stageIndex: draft.stageIndex || 0,
      started: !!draft.started,
      existingAuditId: draft.existingAuditId || null,
      continuingAudit: !!draft.continuingAudit,
      atmId: targetAtmId,
      savedAt: payload.savedAt,
    });
  } catch (cloudErr) {
    console.warn('Cloud draft sync note (draft safely saved locally):', cloudErr?.response?.data || cloudErr?.message);
  }

  return localSaved;
}

/**
 * Load draft from local IndexedDB and cloud MongoDB, returning the latest version.
 */
export async function loadDraftFromStorage(userId, atmId) {
  if (!userId) return null;
  const keys = getStorageKeys(userId, atmId);

  // 1. Load local draft from IndexedDB
  let localDraft = null;
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
      if (draft && isDraftForAtm(draft, atmId)) {
        localDraft = draft;
        break;
      }
    }
  } catch (err) {
    console.warn('IndexedDB load failed:', err);
  }

  if (!localDraft) {
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (isDraftForAtm(parsed, atmId)) {
            localDraft = parsed;
            break;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 2. Fetch from Cloud Server (MongoDB)
  let serverDraft = null;
  try {
    const res = await api.get('/audits/draft', {
      params: atmId ? { atmId } : {},
    });
    if (res.data?.draft && isDraftForAtm(res.data.draft, atmId)) {
      serverDraft = res.data.draft;
    }
  } catch (cloudErr) {
    console.warn('Server draft fetch note:', cloudErr?.message);
  }

  // 3. Resolve which draft is newer
  if (serverDraft && localDraft) {
    const serverTime = new Date(serverDraft.savedAt || serverDraft.updatedAt || 0).getTime();
    const localTime = new Date(localDraft.savedAt || 0).getTime();

    // If server draft is newer (e.g. photos uploaded from phone 2 minutes ago), use server draft
    if (serverTime >= localTime) {
      try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        keys.forEach((k) => store.put(serverDraft, k));
      } catch {
        // ignore
      }
      return { ...serverDraft, isFromCloud: true };
    }
    return localDraft;
  }

  if (serverDraft) {
    // Laptop had no local draft yet, but user took photos on mobile!
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      keys.forEach((k) => store.put(serverDraft, k));
    } catch {
      // ignore
    }
    return { ...serverDraft, isFromCloud: true };
  }

  return localDraft;
}

/**
 * Clear draft from local IndexedDB, localStorage, and cloud MongoDB.
 */
export async function clearDraftFromStorage(userId, atmId) {
  if (!userId) return;
  const keys = getStorageKeys(userId, atmId);
  keys.push(`atm-audit-draft-${userId}`);

  // Clear local IndexedDB
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

  // Clear localStorage
  keys.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  });

  // Clear from MongoDB cloud server
  try {
    await api.delete('/audits/draft', {
      params: atmId ? { atmId } : {},
    });
  } catch (cloudErr) {
    console.warn('Cloud draft delete note:', cloudErr?.message);
  }
}
