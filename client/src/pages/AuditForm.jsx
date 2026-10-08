import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AuditorNav from '../components/AuditorNav';
import CameraCapture from '../components/CameraCapture';
import PhotoLightbox from '../components/PhotoLightbox';
import {
  saveDraftToStorage,
  loadDraftFromStorage,
  clearDraftFromStorage,
} from '../utils/draftStorage';

// Live in-browser camera capture needs a secure context (https, or localhost).
// Over plain http on a LAN IP (needed so phones can reach a dev server) it's
// unavailable, so we fall back to the native file picker's camera capture.
const canUseLiveCamera =
  typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

function buildInitialStages(apiStages) {
  return apiStages.map((stage) => ({
    stageId: stage._id,
    stageName: stage.name,
    questions: stage.questions.map((q) => ({
      questionId: q._id,
      questionText: q.text,
      answer: '',
      reason: '',
      photos: [],
    })),
  }));
}

// Downscale + compress a captured photo client-side so the base64 payload stays small.
// Camera photos can be large (10MP+) and slow to decode on lower-end phones, so this
// is guarded with a timeout rather than hanging forever if decoding never resolves.
function compressImage(file, maxWidth = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Photo processing timed out')), 20000);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        clearTimeout(timeout);
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Could not decode image'));
      };
      img.src = reader.result;
    };
    reader.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Could not read file'));
    };
    reader.readAsDataURL(file);
  });
}

// Processes each file independently so one bad/corrupt photo doesn't silently
// drop the whole batch — returns whatever succeeded plus a count of failures.
async function compressFiles(fileList) {
  const results = await Promise.allSettled(Array.from(fileList).map((file) => compressImage(file)));
  const succeeded = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failedCount = results.length - succeeded.length;
  return { succeeded, failedCount };
}

const MAX_ATM_RESULTS = 20;

export default function AuditForm() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const questionCameraInputRef = useRef(null);
  const questionGalleryInputRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const [processingPhotos, setProcessingPhotos] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [checklistStages, setChecklistStages] = useState([]);
  const [assignedAtms, setAssignedAtms] = useState([]);

  const [selectedAtm, setSelectedAtm] = useState(null);
  const [atmSearch, setAtmSearch] = useState('');
  const [atmDropdownOpen, setAtmDropdownOpen] = useState(false);

  const [photos, setPhotos] = useState([]);
  const [started, setStarted] = useState(false);
  const [stages, setStages] = useState([]);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [existingAuditId, setExistingAuditId] = useState(null);
  const [continuingAudit, setContinuingAudit] = useState(false);
  const [submittedStagesCount, setSubmittedStagesCount] = useState(3);
  const [activePhotoQuestionId, setActivePhotoQuestionId] = useState(null);
  const [cameraTarget, setCameraTarget] = useState(null); // null | 'main' | questionId
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  // Draft persistence states
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSource, setDraftSource] = useState('');

  // Contact editing states
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editContactName, setEditContactName] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [updatingContact, setUpdatingContact] = useState(false);

  // Stage-by-stage saved status & feedback
  const [savedStageIds, setSavedStageIds] = useState(new Set());
  const [stageSuccessMessage, setStageSuccessMessage] = useState('');
  const [savingStageIndex, setSavingStageIndex] = useState(null);

  async function loadAtmState(atm, baseChecklist, existingDraft = null) {
    if (!atm) return;
    const atmId = atm.atmId;

    // Check MongoDB for any previously submitted stages for this ATM
    let prevAudit = null;
    try {
      const res = await api.get(`/audits/atm/${atmId}`);
      prevAudit = res.data;
    } catch (e) {
      // No existing audit for this ATM yet
    }

    const initialStages = buildInitialStages(baseChecklist);
    const prevStages = prevAudit?.stages || [];
    const draftStages = existingDraft?.stages || [];

    const merged = initialStages.map((stage) => {
      const ps = prevStages.find((s) => s.stageId === stage.stageId || s.stageName === stage.stageName);
      const ds = draftStages.find((s) => s.stageId === stage.stageId || s.stageName === stage.stageName);

      return {
        ...stage,
        questions: stage.questions.map((q) => {
          const pq = ps?.questions?.find((x) => x.questionId === q.questionId || x.code === q.code);
          const dq = ds?.questions?.find((x) => x.questionId === q.questionId || x.code === q.code);

          return {
            ...q,
            answer: dq?.answer || pq?.answer || '',
            reason: dq?.reason || pq?.reason || '',
            photos: (dq?.photos && dq.photos.length) ? dq.photos : (pq?.photos && pq.photos.length) ? pq.photos : [],
          };
        }),
      };
    });

    const savedSet = new Set(prevStages.map((s) => s.stageId || s.stageName));
    setSavedStageIds(savedSet);

    // Photos: draft photos > prev audit photos > []
    const restoredPhotos = (existingDraft?.photos && existingDraft.photos.length)
      ? existingDraft.photos
      : (prevAudit?.photos && prevAudit.photos.length)
      ? prevAudit.photos
      : [];
    setPhotos(restoredPhotos);

    // Audit ID & continuing state
    if (prevAudit?._id) {
      setExistingAuditId(prevAudit._id);
      setContinuingAudit(true);
      setStarted(true);
    } else if (existingDraft?.existingAuditId) {
      setExistingAuditId(existingDraft.existingAuditId);
      setContinuingAudit(!!existingDraft.continuingAudit);
      setStarted(!!existingDraft.started);
    } else {
      setExistingAuditId(null);
      setContinuingAudit(false);
      setStarted(restoredPhotos.length > 0 || (existingDraft && !!existingDraft.started));
    }

    setStages(merged);

    // Determine initial stageIndex:
    // If draft had a specific stageIndex, respect it
    // Else find the first incomplete/unsaved stage
    if (Number.isInteger(existingDraft?.stageIndex)) {
      setStageIndex(existingDraft.stageIndex);
    } else if (savedSet.size > 0) {
      const firstIncompleteIdx = merged.findIndex((st) => !savedSet.has(st.stageId) && !savedSet.has(st.stageName));
      setStageIndex(firstIncompleteIdx !== -1 ? firstIncompleteIdx : 0);
    } else {
      setStageIndex(0);
    }

    if (existingDraft) {
      setDraftRestored(true);
      setDraftSource(existingDraft.lastDevice || (existingDraft.isFromCloud ? 'Cloud' : 'Device'));
      if (existingDraft.savedAt) setLastSavedAt(new Date(existingDraft.savedAt));
    } else {
      setDraftRestored(false);
      setDraftSource('');
      setLastSavedAt(null);
    }
  }

  useEffect(() => {
    const preselectedAtmId = searchParams.get('atmId');

    Promise.all([
      api.get('/checklist'),
      api.get('/atms/mine'),
      user?.id ? loadDraftFromStorage(user.id, preselectedAtmId) : Promise.resolve(null),
    ])
      .then(async ([checklistRes, atmsRes, draft]) => {
        setChecklistStages(checklistRes.data);
        setAssignedAtms(atmsRes.data);

        const reqAtm = preselectedAtmId ? String(preselectedAtmId).trim().toLowerCase() : null;
        const draftAtm = draft?.selectedAtm?.atmId ? String(draft.selectedAtm.atmId).trim().toLowerCase() : null;

        const isDraftValid = Boolean(draft && draft.selectedAtm && (!reqAtm || draftAtm === reqAtm));

        if (preselectedAtmId) {
          const match = atmsRes.data.find(
            (a) => a.atmId?.toLowerCase() === reqAtm || a._id === preselectedAtmId
          );
          if (match) setSelectedAtm(match);
          await loadAtmState(match || { atmId: preselectedAtmId }, checklistRes.data, isDraftValid ? draft : null);
        } else if (isDraftValid) {
          setSelectedAtm(draft.selectedAtm);
          await loadAtmState(draft.selectedAtm, checklistRes.data, draft);
        } else {
          setPhotos([]);
          setStarted(false);
          setSelectedAtm(null);
          setDraftRestored(false);
          setDraftSource('');
          setLastSavedAt(null);
          setSavedStageIds(new Set());
          setStages(buildInitialStages(checklistRes.data));
        }
      })
      .catch((err) => setLoadError(err.response?.data?.message || 'Failed to load audit setup'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Persist progress to IndexedDB with debounce so changes aren't lost on refresh/closure
  useEffect(() => {
    if (!user?.id || loading) return;

    if (!selectedAtm && photos.length === 0 && !started) {
      clearDraftFromStorage(user.id, selectedAtm?.atmId);
      return;
    }

    setSavingDraft(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveDraftToStorage(
          user.id,
          {
            selectedAtm,
            photos,
            stages,
            stageIndex,
            started,
            existingAuditId,
            continuingAudit,
          },
          selectedAtm?.atmId
        );
        setLastSavedAt(new Date());
      } catch (err) {
        console.warn('Auto-save draft error:', err);
      } finally {
        setSavingDraft(false);
      }
    }, 350);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [user?.id, loading, selectedAtm, photos, stages, stageIndex, started, existingAuditId, continuingAudit]);

  // Immediate synchronous/direct save on tab close or refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (user?.id && (selectedAtm || photos.length > 0 || started)) {
        saveDraftToStorage(
          user.id,
          {
            selectedAtm,
            photos,
            stages,
            stageIndex,
            started,
            existingAuditId,
            continuingAudit,
          },
          selectedAtm?.atmId
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user?.id, selectedAtm, photos, stages, stageIndex, started, existingAuditId, continuingAudit]);

  const currentStage = stages[stageIndex];
  const isLastStage = stageIndex === stages.length - 1;

  const filteredAtms = useMemo(() => {
    const q = atmSearch.trim().toLowerCase();
    const list = q
      ? assignedAtms.filter(
          (a) =>
            a.atmId.toLowerCase().includes(q) ||
            a.location.toLowerCase().includes(q) ||
            a.area?.name?.toLowerCase().includes(q)
        )
      : assignedAtms;
    return list.slice(0, MAX_ATM_RESULTS);
  }, [assignedAtms, atmSearch]);

  async function selectAtm(atm) {
    if (!atm) return;
    setSelectedAtm(atm);
    setAtmSearch('');
    setAtmDropdownOpen(false);
    setError('');
    setStageSuccessMessage('');

    let existingDraft = null;
    if (user?.id) {
      const d = await loadDraftFromStorage(user.id, atm.atmId);
      if (d && d.selectedAtm?.atmId?.toLowerCase() === atm.atmId.toLowerCase()) {
        existingDraft = d;
      }
    }

    await loadAtmState(atm, checklistStages, existingDraft);
  }

  function closeAtmDropdownSoon() {
    setTimeout(() => setAtmDropdownOpen(false), 120);
  }

  async function handlePhotosChange(e) {
    const files = e.target.files;
    e.target.value = '';
    if (!files || files.length === 0) return;
    setError('');
    setProcessingPhotos(true);
    const { succeeded, failedCount } = await compressFiles(files);
    setProcessingPhotos(false);
    if (succeeded.length) setPhotos((prev) => [...prev, ...succeeded]);
    if (failedCount) setError(`Could not process ${failedCount} photo(s). Please try again.`);
  }

  function removePhoto(index) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function handleStart() {
    setError('');
    if (!selectedAtm) {
      setError('Please select an ATM');
      return;
    }
    if (photos.length === 0) {
      setError('Please take at least one photo of the ATM before starting the audit');
      return;
    }
    setStarted(true);
  }

  function setAnswer(questionId, answer) {
    setStages((prev) =>
      prev.map((stage, i) =>
        i !== stageIndex
          ? stage
          : {
              ...stage,
              questions: stage.questions.map((q) =>
                q.questionId === questionId ? { ...q, answer, reason: answer === 'yes' ? '' : q.reason } : q
              ),
            }
      )
    );
  }

  function setReason(questionId, reason) {
    setStages((prev) =>
      prev.map((stage, i) =>
        i !== stageIndex
          ? stage
          : {
              ...stage,
              questions: stage.questions.map((q) => (q.questionId === questionId ? { ...q, reason } : q)),
            }
      )
    );
  }

  function addQuestionPhotos(questionId, dataUrls) {
    setStages((prev) =>
      prev.map((stage, i) =>
        i !== stageIndex
          ? stage
          : {
              ...stage,
              questions: stage.questions.map((q) =>
                q.questionId === questionId ? { ...q, photos: [...q.photos, ...dataUrls] } : q
              ),
            }
      )
    );
  }

  function removeQuestionPhoto(questionId, index) {
    setStages((prev) =>
      prev.map((stage, i) =>
        i !== stageIndex
          ? stage
          : {
              ...stage,
              questions: stage.questions.map((q) =>
                q.questionId === questionId
                  ? { ...q, photos: q.photos.filter((_, pi) => pi !== index) }
                  : q
              ),
            }
      )
    );
  }

  function requestQuestionPhoto(questionId) {
    setActivePhotoQuestionId(questionId);
    questionCameraInputRef.current?.click();
  }

  function addMainPhotos() {
    if (canUseLiveCamera) {
      setCameraTarget('main');
    } else {
      cameraInputRef.current?.click();
    }
  }

  function addPhotosForQuestion(questionId) {
    if (canUseLiveCamera) {
      setCameraTarget(questionId);
    } else {
      requestQuestionPhoto(questionId);
    }
  }

  function handleCameraCapture(dataUrl) {
    if (cameraTarget === 'main') {
      setPhotos((prev) => [...prev, dataUrl]);
    } else if (cameraTarget) {
      addQuestionPhotos(cameraTarget, [dataUrl]);
    }
  }

  async function handleQuestionPhotoChange(e) {
    const files = e.target.files;
    const questionId = activePhotoQuestionId;
    e.target.value = '';
    if (!files || files.length === 0 || !questionId) return;
    setError('');
    setProcessingPhotos(true);
    const { succeeded, failedCount } = await compressFiles(files);
    setProcessingPhotos(false);
    if (succeeded.length) addQuestionPhotos(questionId, succeeded);
    if (failedCount) setError(`Could not process ${failedCount} photo(s). Please try again.`);
  }

  function isStageComplete(stage) {
    if (!stage || !Array.isArray(stage.questions) || stage.questions.length === 0) return false;
    return stage.questions.every((q) => {
      if (!q.answer || !['yes', 'no'].includes(q.answer)) return false;
      if (q.answer === 'no' && !q.reason?.trim()) return false;
      return true;
    });
  }

  function getStageAnsweredCount(stage) {
    if (!stage || !Array.isArray(stage.questions)) return 0;
    return stage.questions.filter((q) => q.answer === 'yes' || q.answer === 'no').length;
  }

  function validateStageByIndex(index) {
    const stage = stages[index];
    if (!stage) return 'Stage not found';
    for (const q of stage.questions) {
      if (!q.answer) {
        return `Please answer in "${stage.stageName}": ${q.questionText}`;
      }
      if (q.answer === 'no' && !q.reason?.trim()) {
        return `Please provide a reason in "${stage.stageName}" for: ${q.questionText}`;
      }
    }
    return null;
  }

  function validateCurrentStage() {
    return validateStageByIndex(stageIndex);
  }

  function goNext() {
    setError('');
    const validationError = validateCurrentStage();
    if (validationError) {
      setError(validationError);
      return;
    }
    setStageIndex((i) => Math.min(stages.length - 1, i + 1));
  }

  function goBack() {
    setError('');
    setStageIndex((i) => Math.max(0, i - 1));
  }

  const allStagesCompleted = useMemo(() => {
    return stages.length > 0 && stages.every((s) => isStageComplete(s));
  }, [stages]);

  async function handleSaveStage(targetIndex, { advance = false, finish = false } = {}) {
    setError('');
    setStageSuccessMessage('');

    const targetStage = stages[targetIndex];
    if (!targetStage) return;

    // Validate the target stage
    const validationError = validateStageByIndex(targetIndex);
    if (validationError) {
      setStageIndex(targetIndex);
      setError(validationError);
      return;
    }

    // ATM photos check
    if (!photos || photos.length === 0) {
      setError('At least one ATM photo is required to save the audit.');
      return;
    }

    setSubmitting(true);
    setSavingStageIndex(targetIndex);

    try {
      // Include any stage that is complete (or at minimum the target stage)
      const stagesToSubmit = stages.filter((st, idx) => idx === targetIndex || isStageComplete(st));

      const payload = {
        atmId: selectedAtm.atmId,
        area: selectedAtm.area?.name || selectedAtm.zone || 'General',
        photos,
        stages: stagesToSubmit,
      };
      if (existingAuditId) {
        payload.auditId = existingAuditId;
      }

      const res = await api.post('/audits', payload);
      const updatedAudit = res.data;

      if (updatedAudit._id) {
        setExistingAuditId(updatedAudit._id);
        setContinuingAudit(true);
      }

      // Update saved stages tracking
      const newlySaved = new Set((updatedAudit.stages || []).map((s) => s.stageId || s.stageName));
      setSavedStageIds(newlySaved);

      // Check if all 3 stages are now submitted in DB
      const isAllDone = updatedAudit.stages && updatedAudit.stages.length >= Math.min(3, stages.length);

      if (finish || isAllDone) {
        if (user?.id) {
          await clearDraftFromStorage(user.id, selectedAtm?.atmId);
        }
        setSubmittedStagesCount(updatedAudit.stages?.length || 1);
        setSuccess(true);
      } else {
        setStageSuccessMessage(
          `✅ Stage ${targetIndex + 1} (${targetStage.stageName}) saved! (${updatedAudit.stages?.length || 1}/${stages.length} stages saved)`
        );

        if (advance && targetIndex < stages.length - 1) {
          setStageIndex(targetIndex + 1);
        }
      }
    } catch (err) {
      console.error('Stage save error:', err);
      setError(err.response?.data?.message || 'Failed to save stage. Please try again.');
    } finally {
      setSubmitting(false);
      setSavingStageIndex(null);
    }
  }

  async function handleSubmitAllStages() {
    setError('');
    setStageSuccessMessage('');

    // Validate all stages
    for (let i = 0; i < stages.length; i++) {
      const stageError = validateStageByIndex(i);
      if (stageError) {
        setStageIndex(i);
        setError(`Cannot submit full audit: ${stageError}`);
        return;
      }
    }

    if (!photos || photos.length === 0) {
      setError('At least one ATM photo is required to submit the audit.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        atmId: selectedAtm.atmId,
        area: selectedAtm.area?.name || selectedAtm.zone || 'General',
        photos,
        stages,
      };
      if (existingAuditId) {
        payload.auditId = existingAuditId;
      }

      const res = await api.post('/audits', payload);
      if (user?.id) {
        await clearDraftFromStorage(user.id, selectedAtm?.atmId);
      }
      setSubmittedStagesCount(res.data?.stages?.length || stages.length);
      setSuccess(true);
    } catch (err) {
      console.error('Submit all stages error:', err);
      setError(err.response?.data?.message || 'Failed to submit full audit');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmitStages(targetCount) {
    if (targetCount >= stages.length) {
      return handleSubmitAllStages();
    }
    return handleSaveStage(targetCount - 1, { finish: true });
  }

  async function startNewAudit() {
    if (user?.id) {
      await clearDraftFromStorage(user.id, selectedAtm?.atmId);
    }
    setSelectedAtm(null);
    setAtmSearch('');
    setPhotos([]);
    setStarted(false);
    setStages(buildInitialStages(checklistStages));
    setStageIndex(0);
    setExistingAuditId(null);
    setContinuingAudit(false);
    setSubmittedStagesCount(3);
    setSuccess(false);
    setDraftRestored(false);
    setDraftSource('');
    setLastSavedAt(null);
    setSavedStageIds(new Set());
    setStageSuccessMessage('');
  }

  async function handleDiscardDraft() {
    if (
      window.confirm(
        'Are you sure you want to discard the saved draft and start fresh? All un-submitted answers and photos will be cleared.'
      )
    ) {
      await startNewAudit();
    }
  }

  async function handleAddContact() {
    if (!editContactName.trim() || !editContactPhone.trim()) {
      alert('Please provide both name and phone number');
      return;
    }
    setUpdatingContact(true);
    try {
      const res = await api.patch(`/atms/${selectedAtm._id}/contact`, {
        newName: editContactName,
        newPhone: editContactPhone
      });
      setSelectedAtm(prev => ({ ...prev, additionalContacts: res.data.additionalContacts }));
      setEditContactName('');
      setEditContactPhone('');
      setIsEditingContact(false);
    } catch (err) {
      alert('Failed to add contact info');
    } finally {
      setUpdatingContact(false);
    }
  }

  if (loading) {
    return (
      <div className="page-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-center">
        <div className="card">
          <p className="error">{loadError}</p>
          <button className="link" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="page-center">
        <div className="card" style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
          <h1 style={{ margin: '0 0 8px' }}>Audit Submitted!</h1>
          <div
            style={{
              display: 'inline-block',
              margin: '8px auto 16px',
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: '0.85rem',
              fontWeight: 700,
              background: submittedStagesCount >= 3 ? '#dcfce7' : '#fef3c7',
              color: submittedStagesCount >= 3 ? '#15803d' : '#b45309',
              border: submittedStagesCount >= 3 ? '1px solid #bbf7d0' : '1px solid #fde68a',
            }}
          >
            {submittedStagesCount === 1
              ? '📦 Stage 1 (Hardware Verification) Audit Saved'
              : submittedStagesCount === 2
              ? '📋 Stages 1 & 2 Audit Saved'
              : '✅ All 3 Stages (Complete Audit) Saved'}
          </div>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 24, fontSize: '0.95rem' }}>
            The inspection report for ATM <strong>{selectedAtm?.atmId}</strong> ({selectedAtm?.area?.name}) has been saved successfully.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => navigate('/auditor/audits')}
              style={{
                padding: '10px 18px',
                fontWeight: 600,
                borderRadius: 8,
              }}
            >
              📋 View in Submitted Audits &rarr;
            </button>
            <button
              onClick={() => navigate('/auditor')}
              style={{
                padding: '10px 18px',
                fontWeight: 600,
                borderRadius: 8,
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid var(--color-border)',
              }}
            >
              📍 Back to Assigned ATMs
            </button>
            <button
              onClick={startNewAudit}
              style={{
                padding: '10px 18px',
                fontWeight: 600,
                borderRadius: 8,
                background: '#ffffff',
                color: 'var(--color-primary)',
                border: '1px solid var(--color-border)',
              }}
            >
              ➕ Audit Another ATM
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="page">
        <Topbar>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="user-chip">
              <span className="user-chip-name">{user?.name}</span> <span className="role-badge">Auditor</span>
            </span>
            {lastSavedAt && (
              <span
                style={{
                  fontSize: '0.78rem',
                  padding: '3px 8px',
                  borderRadius: 12,
                  background: savingDraft ? '#fef3c7' : '#ecfdf5',
                  color: savingDraft ? '#b45309' : '#047857',
                  border: savingDraft ? '1px solid #fde68a' : '1px solid #a7f3d0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontWeight: 600,
                }}
                title="Synced across your phone and laptop in real-time"
              >
                {savingDraft ? '🔄 Syncing draft...' : `☁️ Synced (${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
              </span>
            )}
          </div>
          <button className="link" onClick={logout}>
            Logout
          </button>
        </Topbar>

        <AuditorNav />

        <div className="card wide">
          {draftRestored && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 16px',
                borderRadius: 10,
                background: '#f0fdf4',
                border: '1.5px solid #86efac',
                color: '#166534',
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                boxShadow: '0 2px 6px rgba(22, 101, 52, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.4rem' }}>{draftSource?.toLowerCase().includes('mobile') ? '📱' : '☁️'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                    Draft Synced {draftSource ? `from ${draftSource}` : 'Across Devices'}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#15803d', marginTop: 2 }}>
                    ATM <strong>{selectedAtm?.atmId}</strong> ({photos.length} photo{photos.length !== 1 ? 's' : ''} attached) has been restored. You can continue seamlessly on this device!
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDiscardDraft}
                style={{
                  background: '#ffffff',
                  border: '1px solid #dc2626',
                  color: '#dc2626',
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Discard & Start Fresh
              </button>
            </div>
          )}

          <h1>Start New Audit</h1>

          {assignedAtms.length === 0 ? (
            <p className="empty-state">No ATMs are assigned to you yet. Contact your admin.</p>
          ) : (
            <label>
              ATM
              <div className="atm-picker">
                <input
                  value={selectedAtm ? `${selectedAtm.atmId} — ${selectedAtm.area?.name}` : atmSearch}
                  onChange={(e) => {
                    setSelectedAtm(null);
                    setAtmSearch(e.target.value);
                    setAtmDropdownOpen(true);
                  }}
                  onFocus={() => setAtmDropdownOpen(true)}
                  onBlur={closeAtmDropdownSoon}
                  placeholder="Search your assigned ATMs by ID, area, or location..."
                />
                {atmDropdownOpen && (
                  <div className="atm-dropdown">
                    {filteredAtms.length === 0 && <div className="atm-dropdown-empty">No matching ATMs</div>}
                    {filteredAtms.map((a) => (
                      <div key={a._id} className="atm-dropdown-item" onClick={() => selectAtm(a)}>
                        <strong>{a.atmId}</strong>
                        <span>
                          {a.area?.name} &middot; {a.location}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </label>
          )}

          {selectedAtm && (
            <div style={{ background: '#f1f5f9', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', margin: '14px 0', fontSize: '0.88rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                <strong>📍 {selectedAtm.branchName || selectedAtm.location || selectedAtm.atmId}</strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  {selectedAtm.vendor && <span className="role-badge">{selectedAtm.vendor}</span>}
                  {selectedAtm.siteType && <span className="role-badge" style={{ background: '#e2e8f0', color: '#334155' }}>{selectedAtm.siteType}</span>}
                </div>
              </div>
              {selectedAtm.address && (
                <div
                  style={{
                    color: '#1e293b',
                    marginBottom: 8,
                    fontSize: '0.88rem',
                    lineHeight: 1.45,
                    background: '#ffffff',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    wordBreak: 'break-word',
                  }}
                >
                  📍 <strong>Full Address:</strong> {selectedAtm.address}
                  {selectedAtm.pincode && <span> &bull; <strong>PIN:</strong> {selectedAtm.pincode}</span>}
                  {selectedAtm.state && <span> &bull; <strong>State:</strong> {selectedAtm.state}</span>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.82rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      👤 <strong>In-Charge:</strong> {selectedAtm.inchargeName || 'Not Provided'} {selectedAtm.inchargeDesig && `(${selectedAtm.inchargeDesig})`}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      📞 <strong>Contact:</strong> {selectedAtm.inchargeContact ? <a href={`tel:${selectedAtm.inchargeContact}`}>{selectedAtm.inchargeContact}</a> : 'Not Provided'}
                    </span>
                    {selectedAtm.bic && !isEditingContact && (
                      <span>
                        🏷️ <strong>BIC:</strong> {selectedAtm.bic}
                      </span>
                    )}
                  </div>
                  {selectedAtm.additionalContacts && selectedAtm.additionalContacts.map((contact, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0369a1' }}>
                        👤 <strong>Additional Contact:</strong> {contact.name}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0369a1' }}>
                        📞 <strong>Phone:</strong> <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                      </span>
                    </div>
                  ))}
                </div>

                {isEditingContact ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%', background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}>
                    <input type="text" placeholder="New Contact Name" value={editContactName} onChange={e => setEditContactName(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }} />
                    <input type="text" placeholder="Phone Number" value={editContactPhone} onChange={e => setEditContactPhone(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }} />
                    <button type="button" onClick={handleAddContact} disabled={updatingContact} style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#059669', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{updatingContact ? 'Saving...' : 'Save'}</button>
                    <button type="button" onClick={() => setIsEditingContact(false)} style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => {
                    setEditContactName('');
                    setEditContactPhone('');
                    setIsEditingContact(true);
                  }} style={{ fontSize: '0.78rem', background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', textDecoration: 'underline' }}>➕ Add Contact Info</button>
                )}
              </div>

              {(selectedAtm.link || (selectedAtm.links && selectedAtm.links.length > 0)) && (
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px dashed #cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#0369a1', fontSize: '0.85rem' }}>
                    🔗 Site / Installation Link:
                  </span>
                  {(selectedAtm.links && selectedAtm.links.length > 0 ? selectedAtm.links : [selectedAtm.link]).map(
                    (url, idx) => {
                      const isBom = url && url.toLowerCase().includes('bom');
                      return (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 14px',
                            background: isBom ? '#d97706' : '#0284c7',
                            color: '#ffffff',
                            borderRadius: 6,
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            textDecoration: 'none',
                            boxShadow: isBom ? '0 1px 3px rgba(217, 119, 6, 0.2)' : '0 1px 3px rgba(2, 132, 199, 0.2)',
                          }}
                        >
                          <span>{isBom ? '📄' : '🌐'}</span> {isBom ? 'Open BOM Document' : 'Open Site / IR Link'} {selectedAtm.links?.length > 1 ? `#${idx + 1}` : ''} ↗
                        </a>
                      );
                    }
                  )}
                  {selectedAtm.deviceId && (
                    <span
                      style={{
                        fontSize: '0.8rem',
                        color: '#475569',
                        background: '#e2e8f0',
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontWeight: 500,
                      }}
                    >
                      Unit ID: <strong>{selectedAtm.deviceId}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="photo-capture">
            <span className="photo-capture-label">
              ATM Photos <span className="photo-hint">(at least 1 required before you can start)</span>
            </span>

            {photos.length > 0 && (
              <div className="photo-grid">
                {photos.map((p, i) => (
                  <div className="photo-grid-item" key={i}>
                    <img src={p} alt={`ATM ${i + 1}`} onClick={() => setLightboxPhoto(p)} />
                    <button
                      type="button"
                      className="photo-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePhoto(i);
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {processingPhotos && <p className="photo-hint">Processing photo...</p>}

            {photos.length === 0 ? (
              <div className="photo-dropzone" onClick={addMainPhotos}>
                <svg
                  className="photo-dropzone-icon"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                  <circle cx="12" cy="13.5" r="3.5" />
                </svg>
                <div>Tap to take a photo of the ATM</div>
              </div>
            ) : (
              <button type="button" className="btn-secondary" onClick={addMainPhotos}>
                + Add More Photos
              </button>
            )}

            <button
              type="button"
              className="link"
              style={{ display: 'block', marginTop: 10 }}
              onClick={() => galleryInputRef.current?.click()}
            >
              Or choose from gallery
            </button>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotosChange}
              style={{ display: 'none' }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotosChange}
              style={{ display: 'none' }}
            />
          </div>

          {error && <p className="error">{error}</p>}

          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <button onClick={handleStart} disabled={assignedAtms.length === 0}>
              Start Audit
            </button>
          </div>
        </div>

        {cameraTarget && <CameraCapture onCapture={handleCameraCapture} onClose={() => setCameraTarget(null)} />}
        {lightboxPhoto && <PhotoLightbox src={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />}
      </div>
    );
  }

  return (
    <div className="page">
      <Topbar>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="user-chip">
            <span className="user-chip-name">{user?.name}</span> <span className="role-badge">Auditor</span>
          </span>
          {lastSavedAt && (
            <span
              style={{
                fontSize: '0.78rem',
                padding: '3px 8px',
                borderRadius: 12,
                background: savingDraft ? '#fef3c7' : '#ecfdf5',
                color: savingDraft ? '#b45309' : '#047857',
                border: savingDraft ? '1px solid #fde68a' : '1px solid #a7f3d0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
              }}
              title="Synced across your phone and laptop in real-time"
            >
              {savingDraft ? '🔄 Syncing draft...' : `☁️ Synced (${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
            </span>
          )}
        </div>
        <button className="link" onClick={logout}>
          Logout
        </button>
      </Topbar>

      <div className="card wide">
        {draftRestored && (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              borderRadius: 10,
              background: '#f0fdf4',
              border: '1.5px solid #86efac',
              color: '#166534',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              boxShadow: '0 2px 6px rgba(22, 101, 52, 0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.4rem' }}>{draftSource?.toLowerCase().includes('mobile') ? '📱' : '☁️'}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                  Draft Synced {draftSource ? `from ${draftSource}` : 'Across Devices'}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#15803d', marginTop: 2 }}>
                  ATM <strong>{selectedAtm?.atmId}</strong> questions, answers, reasons & {photos.length} photo{photos.length !== 1 ? 's' : ''} loaded. You can continue seamlessly on this device!
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDiscardDraft}
              style={{
                background: '#ffffff',
                border: '1px solid #dc2626',
                color: '#dc2626',
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Discard & Start Fresh
            </button>
          </div>
        )}

        <div
          className="audit-meta-row"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {photos[0] && <img src={photos[0]} alt="ATM" className="photo-thumb" />}
            <div>
              <h1 style={{ margin: 0 }}>ATM Audit Form</h1>
              <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                ATM ID: <strong>{selectedAtm.atmId}</strong> &middot; Area: <strong>{selectedAtm.area?.name}</strong>
                {selectedAtm.branchName && <> &middot; <strong>{selectedAtm.branchName}</strong></>}
                {photos.length > 1 && <> &middot; {photos.length} photos attached</>}
              </p>
              {selectedAtm.address && (
                <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '0.84rem', lineHeight: 1.4, wordBreak: 'break-word', maxWidth: 650 }}>
                  📍 {selectedAtm.address} {selectedAtm.pincode ? `(PIN: ${selectedAtm.pincode})` : ''}
                </p>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.82rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      👤 <strong>In-Charge:</strong> {selectedAtm.inchargeName || 'Not Provided'} {selectedAtm.inchargeDesig && `(${selectedAtm.inchargeDesig})`}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      📞 <strong>Contact:</strong> {selectedAtm.inchargeContact ? <a href={`tel:${selectedAtm.inchargeContact}`}>{selectedAtm.inchargeContact}</a> : 'Not Provided'}
                    </span>
                  </div>
                  {selectedAtm.additionalContacts && selectedAtm.additionalContacts.map((contact, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0369a1' }}>
                        👤 <strong>Additional Contact:</strong> {contact.name}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0369a1' }}>
                        📞 <strong>Phone:</strong> <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                      </span>
                    </div>
                  ))}
                </div>

                {isEditingContact ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%', background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}>
                    <input type="text" placeholder="New Contact Name" value={editContactName} onChange={e => setEditContactName(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }} />
                    <input type="text" placeholder="Phone Number" value={editContactPhone} onChange={e => setEditContactPhone(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }} />
                    <button type="button" onClick={handleAddContact} disabled={updatingContact} style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#059669', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{updatingContact ? 'Saving...' : 'Save'}</button>
                    <button type="button" onClick={() => setIsEditingContact(false)} style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => {
                    setEditContactName('');
                    setEditContactPhone('');
                    setIsEditingContact(true);
                  }} style={{ fontSize: '0.78rem', background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', textDecoration: 'underline' }}>➕ Add Contact Info</button>
                )}
              </div>
            </div>
          </div>

          {(selectedAtm?.link || (selectedAtm?.links && selectedAtm.links.length > 0)) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(selectedAtm.links && selectedAtm.links.length > 0 ? selectedAtm.links : [selectedAtm.link]).map(
                (url, idx) => {
                  const isBom = url && url.toLowerCase().includes('bom');
                  return (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 16px',
                        background: isBom ? '#d97706' : '#0284c7',
                        color: '#ffffff',
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        textDecoration: 'none',
                        boxShadow: isBom ? '0 2px 4px rgba(217, 119, 6, 0.25)' : '0 2px 4px rgba(2, 132, 199, 0.25)',
                      }}
                    >
                      <span>{isBom ? '📄' : '🔗'}</span> {isBom ? 'Open BOM Document' : 'Open Site Link'} {selectedAtm.links?.length > 1 ? `#${idx + 1}` : ''} ↗
                    </a>
                  );
                }
              )}
            </div>
          )}
        </div>

        {continuingAudit && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 16px',
              borderRadius: 8,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1e40af',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>📌</span>
            <span>
              <strong>Continuing Audit for ATM {selectedAtm.atmId}:</strong> Previous stage responses have been loaded. You can now complete and submit subsequent stages.
            </span>
          </div>
        )}

        <div className="stage-tracker" style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stages.map((stage, i) => {
            const isComplete = isStageComplete(stage);
            const answeredCount = getStageAnsweredCount(stage);
            const totalCount = stage.questions?.length || 0;
            const isActive = i === stageIndex;
            const isSaved = savedStageIds.has(stage.stageId) || savedStageIds.has(stage.stageName);
            return (
              <button
                key={stage.stageId}
                type="button"
                onClick={() => {
                  setError('');
                  setStageSuccessMessage('');
                  setStageIndex(i);
                }}
                className={`stage-pill ${isActive ? 'active' : isComplete ? 'done' : ''}`}
                style={{
                  cursor: 'pointer',
                  border: isActive
                    ? '2px solid var(--color-primary)'
                    : isSaved
                    ? '2px solid #059669'
                    : '1px solid #cbd5e1',
                  background: isActive
                    ? '#eff6ff'
                    : isSaved
                    ? '#ecfdf5'
                    : isComplete
                    ? '#f0fdf4'
                    : '#ffffff',
                  color: isActive
                    ? '#1d4ed8'
                    : isSaved
                    ? '#047857'
                    : isComplete
                    ? '#15803d'
                    : '#475569',
                  padding: '7px 14px',
                  borderRadius: 20,
                  fontSize: '0.84rem',
                  fontWeight: isActive ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                  boxShadow: isSaved ? '0 1px 3px rgba(5, 150, 105, 0.15)' : 'none',
                }}
              >
                <span>{isSaved ? '💾' : isComplete ? '✅' : isActive ? '👉' : '⚪'}</span>
                <span>{i + 1}. {stage.stageName}</span>
                {isSaved ? (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: '#a7f3d0',
                      color: '#065f46',
                      fontWeight: 700,
                    }}
                  >
                    Saved
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      opacity: 0.85,
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: 'rgba(0,0,0,0.06)',
                    }}
                  >
                    {answeredCount}/{totalCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {stageSuccessMessage && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 8,
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#047857',
              fontSize: '0.88rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>{stageSuccessMessage}</span>
            <button
              type="button"
              onClick={() => setStageSuccessMessage('')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#047857',
                fontWeight: 700,
                fontSize: '1rem',
              }}
            >
              &times;
            </button>
          </div>
        )}

        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

        <div className="questions">
          {currentStage.questions.map((q) => (
            <div className="question" key={q.questionId}>
              <p>{q.questionText}</p>
              <div className="yes-no">
                <label>
                  <input
                    type="radio"
                    name={q.questionId}
                    checked={q.answer === 'yes'}
                    onChange={() => setAnswer(q.questionId, 'yes')}
                  />
                  Yes
                </label>
                <label>
                  <input
                    type="radio"
                    name={q.questionId}
                    checked={q.answer === 'no'}
                    onChange={() => setAnswer(q.questionId, 'no')}
                  />
                  No
                </label>
              </div>
              {q.answer === 'no' && (
                <textarea
                  placeholder="Reason for non-compliance"
                  value={q.reason}
                  onChange={(e) => setReason(q.questionId, e.target.value)}
                />
              )}

              <div className="question-photo">
                {q.photos.length > 0 && (
                  <div className="photo-grid">
                    {q.photos.map((p, i) => (
                      <div className="photo-grid-item" key={i}>
                        <img src={p} alt="Attached" onClick={() => setLightboxPhoto(p)} />
                        <button
                          type="button"
                          className="photo-remove-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeQuestionPhoto(q.questionId, i);
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="btn-secondary btn-add-photo"
                  onClick={() => addPhotosForQuestion(q.questionId)}
                >
                  + Add Photo
                </button>
                <button
                  type="button"
                  className="link btn-add-photo"
                  style={{ marginLeft: 10 }}
                  onClick={() => {
                    setActivePhotoQuestionId(q.questionId);
                    questionGalleryInputRef.current?.click();
                  }}
                >
                  or from gallery
                </button>
              </div>
            </div>
          ))}
        </div>

        {processingPhotos && <p className="photo-hint">Processing photo...</p>}

        <input
          ref={questionCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleQuestionPhotoChange}
          style={{ display: 'none' }}
        />
        <input
          ref={questionGalleryInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleQuestionPhotoChange}
          style={{ display: 'none' }}
        />

        {/* Stage helper info banner */}
        <div
          style={{
            marginTop: 20,
            padding: '10px 14px',
            borderRadius: 8,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span style={{ fontSize: '0.84rem', color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>💡</span>
            <span>
              <strong>Independent Stages:</strong> Fill and save each stage separately. Once all 3 stages are saved, they automatically merge into a single complete audit!
            </span>
          </span>
          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 6,
              background: isStageComplete(currentStage) ? '#dcfce7' : '#fef3c7',
              color: isStageComplete(currentStage) ? '#15803d' : '#b45309',
            }}
          >
            Current Stage: {isStageComplete(currentStage) ? 'Ready ✅' : `${getStageAnsweredCount(currentStage)} of ${currentStage.questions?.length || 0} Answered`}
          </span>
        </div>

        <div className="actions" style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
          <div>
            <button
              type="button"
              className="btn-secondary"
              onClick={goBack}
              disabled={stageIndex === 0}
            >
              &larr; Previous Stage
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Save Current Stage Independently */}
            <button
              type="button"
              onClick={() => handleSaveStage(stageIndex, { advance: false })}
              disabled={submitting}
              style={{
                background: (savedStageIds.has(currentStage?.stageId) || savedStageIds.has(currentStage?.stageName)) ? '#047857' : '#0284c7',
                color: '#ffffff',
                fontWeight: 600,
                padding: '10px 16px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)',
              }}
              title={`Save ${currentStage?.stageName} to cloud`}
            >
              <span>💾</span>{' '}
              {submitting && savingStageIndex === stageIndex
                ? 'Saving Stage...'
                : (savedStageIds.has(currentStage?.stageId) || savedStageIds.has(currentStage?.stageName))
                ? `Update Stage ${stageIndex + 1}`
                : `Save Stage ${stageIndex + 1}`}
            </button>

            {/* If not last stage: Save & Next OR Next */}
            {!isLastStage && (
              <>
                <button
                  type="button"
                  onClick={() => handleSaveStage(stageIndex, { advance: true })}
                  disabled={submitting}
                  style={{
                    background: '#059669',
                    color: '#ffffff',
                    fontWeight: 600,
                    padding: '10px 16px',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
                  }}
                  title="Save current stage and proceed to next stage"
                >
                  <span>💾</span> Save & Next: Stage {stageIndex + 2} &rarr;
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="btn-secondary"
                  style={{
                    padding: '10px 16px',
                    fontWeight: 600,
                    borderRadius: 8,
                  }}
                >
                  Next Stage &rarr;
                </button>
              </>
            )}

            {/* Save & Finish for now (partial exit) */}
            {savedStageIds.size > 0 && savedStageIds.size < stages.length && (
              <button
                type="button"
                onClick={() => handleSaveStage(stageIndex, { finish: true })}
                disabled={submitting}
                className="btn-secondary"
                style={{
                  padding: '9px 14px',
                  fontSize: '0.85rem',
                  color: '#475569',
                }}
                title="Save current stage and exit to dashboard"
              >
                📤 Save & Exit for Now
              </button>
            )}

            {/* Full Audit Submit button (on last stage OR whenever all stages completed) */}
            {(isLastStage || allStagesCompleted) && (
              <button
                type="button"
                onClick={handleSubmitAllStages}
                disabled={submitting}
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 700,
                  padding: '10px 20px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)',
                }}
              >
                <span>✅</span> {submitting ? 'Submitting Full Audit...' : 'Submit Full Audit (All 3 Stages)'}
              </button>
            )}
          </div>
        </div>
      </div>

      {cameraTarget && <CameraCapture onCapture={handleCameraCapture} onClose={() => setCameraTarget(null)} />}
      {lightboxPhoto && <PhotoLightbox src={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />}
    </div>
  );
}
