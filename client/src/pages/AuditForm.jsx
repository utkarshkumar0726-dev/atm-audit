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

  useEffect(() => {
    const preselectedAtmId = searchParams.get('atmId');
    const isContinue = searchParams.get('continue') === 'true';

    Promise.all([
      api.get('/checklist'),
      api.get('/atms/mine'),
      user?.id ? loadDraftFromStorage(user.id, preselectedAtmId) : Promise.resolve(null),
    ])
      .then(([checklistRes, atmsRes, draft]) => {
        setChecklistStages(checklistRes.data);
        setAssignedAtms(atmsRes.data);

        const reqAtm = preselectedAtmId ? String(preselectedAtmId).trim().toLowerCase() : null;
        const draftAtm = draft?.selectedAtm?.atmId ? String(draft.selectedAtm.atmId).trim().toLowerCase() : null;

        // Draft is ONLY valid if:
        // 1. No specific ATM was requested in URL (loaded /audit/new directly)
        // 2. OR the draft belongs to the EXACT preselected ATM!
        const isDraftValid = Boolean(draft && draft.selectedAtm && (!reqAtm || draftAtm === reqAtm));

        if (isDraftValid) {
          setSelectedAtm(draft.selectedAtm);
          setPhotos(draft.photos || []);
          setStages(draft.stages?.length ? draft.stages : buildInitialStages(checklistRes.data));
          setStageIndex(draft.stageIndex || 0);
          setStarted(!!draft.started);
          if (draft.existingAuditId) setExistingAuditId(draft.existingAuditId);
          if (draft.continuingAudit) setContinuingAudit(draft.continuingAudit);
          setDraftRestored(true);
          setDraftSource(draft.lastDevice || (draft.isFromCloud ? 'Cloud' : 'Device'));
          if (draft.savedAt) setLastSavedAt(new Date(draft.savedAt));
        } else if (preselectedAtmId) {
          const match = atmsRes.data.find(
            (a) => a.atmId?.toLowerCase() === reqAtm || a._id === preselectedAtmId
          );
          if (match) setSelectedAtm(match);
          setPhotos([]);
          setStarted(false);
          setExistingAuditId(null);
          setContinuingAudit(false);
          setDraftRestored(false);
          setDraftSource('');
          setLastSavedAt(null);

          const initial = buildInitialStages(checklistRes.data);

          if (isContinue) {
            api
              .get(`/audits/atm/${preselectedAtmId}`)
              .then((auditRes) => {
                const prev = auditRes.data;
                if (prev) {
                  setExistingAuditId(prev._id);
                  setContinuingAudit(true);
                  if (prev.photos?.length) setPhotos(prev.photos);
                  setStarted(true);

                  const merged = initial.map((stage) => {
                    const prevStage = prev.stages?.find(
                      (ps) => ps.stageId === stage.stageId || ps.stageName === stage.stageName
                    );
                    if (!prevStage) return stage;
                    return {
                      ...stage,
                      questions: stage.questions.map((q) => {
                        const prevQ = prevStage.questions?.find(
                          (pq) => pq.questionId === q.questionId || pq.code === q.code
                        );
                        if (!prevQ) return q;
                        return {
                          ...q,
                          answer: prevQ.answer || '',
                          reason: prevQ.reason || '',
                          photos: prevQ.photos || [],
                        };
                      }),
                    };
                  });
                  setStages(merged);
                  const nextIndex = Math.min(prev.stages?.length || 0, merged.length - 1);
                  setStageIndex(nextIndex);
                } else {
                  setStages(initial);
                }
              })
              .catch(() => {
                setStages(initial);
              });
          } else {
            setStages(initial);
          }
        } else {
          setPhotos([]);
          setStarted(false);
          setSelectedAtm(null);
          setDraftRestored(false);
          setDraftSource('');
          setLastSavedAt(null);
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
    const newAtmId = atm.atmId;
    setSelectedAtm(atm);
    setAtmSearch('');
    setAtmDropdownOpen(false);
    setError('');

    // Check if this newly selected ATM already has a saved draft
    if (user?.id) {
      const existingDraft = await loadDraftFromStorage(user.id, newAtmId);
      if (
        existingDraft &&
        existingDraft.selectedAtm?.atmId?.toLowerCase() === newAtmId.toLowerCase()
      ) {
        setPhotos(existingDraft.photos || []);
        setStages(existingDraft.stages?.length ? existingDraft.stages : buildInitialStages(checklistStages));
        setStageIndex(existingDraft.stageIndex || 0);
        setStarted(!!existingDraft.started);
        if (existingDraft.existingAuditId) setExistingAuditId(existingDraft.existingAuditId);
        if (existingDraft.continuingAudit) setContinuingAudit(existingDraft.continuingAudit);
        setDraftRestored(true);
        setDraftSource(existingDraft.lastDevice || (existingDraft.isFromCloud ? 'Cloud' : 'Device'));
        if (existingDraft.savedAt) setLastSavedAt(new Date(existingDraft.savedAt));
        return;
      }
    }

    // Otherwise, start fresh for this newly picked ATM
    setPhotos([]);
    setStages(buildInitialStages(checklistStages));
    setStageIndex(0);
    setStarted(false);
    setExistingAuditId(null);
    setContinuingAudit(false);
    setDraftRestored(false);
    setDraftSource('');
    setLastSavedAt(null);
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

  async function handleSubmitStages(targetCount) {
    setError('');

    const count = targetCount || (stageIndex + 1);
    for (let i = 0; i < count; i++) {
      const stageError = validateStageByIndex(i);
      if (stageError) {
        setStageIndex(i);
        setError(stageError);
        return;
      }
    }

    const stagesToSubmit = stages.slice(0, count);

    setSubmitting(true);
    try {
      const payload = {
        atmId: selectedAtm.atmId,
        area: selectedAtm.area?.name,
        photos,
        stages: stagesToSubmit,
      };
      if (existingAuditId) {
        payload.auditId = existingAuditId;
      }

      await api.post('/audits', payload);
      if (user?.id) {
        await clearDraftFromStorage(user.id, selectedAtm?.atmId);
      }
      setSubmittedStagesCount(count);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit audit');
    } finally {
      setSubmitting(false);
    }
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
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.82rem' }}>
                {selectedAtm.inchargeName && (
                  <span>
                    👤 <strong>In-Charge:</strong> {selectedAtm.inchargeName} {selectedAtm.inchargeDesig && `(${selectedAtm.inchargeDesig})`}
                  </span>
                )}
                {selectedAtm.inchargeContact && (
                  <span>
                    📞 <strong>Contact:</strong> <a href={`tel:${selectedAtm.inchargeContact}`}>{selectedAtm.inchargeContact}</a>
                  </span>
                )}
                {selectedAtm.bic && (
                  <span>
                    🏷️ <strong>BIC:</strong> {selectedAtm.bic}
                  </span>
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
            return (
              <button
                key={stage.stageId}
                type="button"
                onClick={() => {
                  setError('');
                  setStageIndex(i);
                }}
                className={`stage-pill ${isActive ? 'active' : isComplete ? 'done' : ''}`}
                style={{
                  cursor: 'pointer',
                  border: isActive ? '2px solid var(--color-primary)' : '1px solid #cbd5e1',
                  background: isActive ? '#eff6ff' : isComplete ? '#ecfdf5' : '#ffffff',
                  color: isActive ? '#1d4ed8' : isComplete ? '#047857' : '#475569',
                  padding: '7px 14px',
                  borderRadius: 20,
                  fontSize: '0.84rem',
                  fontWeight: isActive ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{isComplete ? '✅' : isActive ? '👉' : '⚪'}</span>
                <span>{i + 1}. {stage.stageName}</span>
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
              </button>
            );
          })}
        </div>

        {error && <p className="error">{error}</p>}

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
              <strong>Flexible Audit:</strong> You can submit <strong>Stage 1 (Hardware)</strong> alone, submit <strong>Stages 1 & 2</strong>, or complete all <strong>3 Stages</strong>.
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

        <div className="actions" style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
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
            {/* If on Stage 1 (Hardware) */}
            {stageIndex === 0 && (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmitStages(1)}
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
                  title="Submit only Stage 1 (Hardware Verification) audit for this ATM"
                >
                  <span>📤</span> {submitting ? 'Submitting...' : 'Submit Stage 1 Only (Hardware)'}
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  style={{
                    padding: '10px 18px',
                    fontWeight: 600,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  Next: Stage 2 &rarr;
                </button>
              </>
            )}

            {/* If on Stage 2 (Functional) */}
            {stageIndex === 1 && (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmitStages(1)}
                  disabled={submitting}
                  className="btn-secondary"
                  style={{
                    padding: '9px 14px',
                    fontSize: '0.85rem',
                  }}
                  title="Submit only Stage 1 if you do not wish to submit Stage 2"
                >
                  Submit Stage 1 Only
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitStages(2)}
                  disabled={submitting}
                  style={{
                    background: '#0284c7',
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
                >
                  <span>📤</span> {submitting ? 'Submitting...' : 'Submit Stages 1 & 2'}
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  style={{
                    padding: '10px 18px',
                    fontWeight: 600,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  Next: Stage 3 &rarr;
                </button>
              </>
            )}

            {/* If on Stage 3 (Network / Last stage) */}
            {stageIndex === 2 && (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmitStages(2)}
                  disabled={submitting}
                  className="btn-secondary"
                  style={{
                    padding: '9px 14px',
                    fontSize: '0.85rem',
                  }}
                  title="Submit Stages 1 & 2 if Stage 3 is not ready"
                >
                  Submit Stages 1 & 2 Only
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitStages(3)}
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
                    boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
                  }}
                >
                  <span>✅</span> {submitting ? 'Submitting...' : 'Submit Full Audit (All 3 Stages)'}
                </button>
              </>
            )}

            {/* Fallback for any other stage count */}
            {stageIndex > 2 && (
              <button
                type="button"
                onClick={() => handleSubmitStages(stages.length)}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit Audit'}
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
