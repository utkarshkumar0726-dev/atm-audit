import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AuditorNav from '../components/AuditorNav';
import CameraCapture from '../components/CameraCapture';
import PhotoLightbox from '../components/PhotoLightbox';

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

// Keeps an in-progress audit across accidental refreshes/tab closes. Best-effort:
// wrapped in try/catch since private browsing or a full quota (lots of photos)
// can make localStorage throw — worst case we just fall back to a blank form.
function draftKey(userId) {
  return `atm-audit-draft-${userId}`;
}

function loadDraft(userId) {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(userId, draft) {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    // ignore — progress just won't survive a refresh this time
  }
}

function clearDraft(userId) {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    // ignore
  }
}

export default function AuditForm() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const questionCameraInputRef = useRef(null);
  const questionGalleryInputRef = useRef(null);
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
  const [activePhotoQuestionId, setActivePhotoQuestionId] = useState(null);
  const [cameraTarget, setCameraTarget] = useState(null); // null | 'main' | questionId
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/checklist'), api.get('/atms/mine')])
      .then(([checklistRes, atmsRes]) => {
        setChecklistStages(checklistRes.data);
        setAssignedAtms(atmsRes.data);

        const draft = user?.id ? loadDraft(user.id) : null;
        const preselectedAtmId = searchParams.get('atmId');

        if (draft?.selectedAtm) {
          setSelectedAtm(draft.selectedAtm);
          setPhotos(draft.photos || []);
          setStages(draft.stages?.length ? draft.stages : buildInitialStages(checklistRes.data));
          setStageIndex(draft.stageIndex || 0);
          setStarted(!!draft.started);
        } else if (preselectedAtmId) {
          const match = atmsRes.data.find(
            (a) => a.atmId === preselectedAtmId || a._id === preselectedAtmId
          );
          if (match) setSelectedAtm(match);
          setStages(buildInitialStages(checklistRes.data));
        } else {
          setStages(buildInitialStages(checklistRes.data));
        }
      })
      .catch((err) => setLoadError(err.response?.data?.message || 'Failed to load audit setup'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist progress so a refresh or accidental tab close doesn't lose it.
  useEffect(() => {
    if (!user?.id || loading) return;
    if (!selectedAtm && photos.length === 0 && !started) {
      clearDraft(user.id);
      return;
    }
    saveDraft(user.id, { selectedAtm, photos, stages, stageIndex, started });
  }, [user?.id, loading, selectedAtm, photos, stages, stageIndex, started]);

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

  function selectAtm(atm) {
    setSelectedAtm(atm);
    setAtmSearch('');
    setAtmDropdownOpen(false);
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

  function validateCurrentStage() {
    for (const q of currentStage.questions) {
      if (!q.answer) return `Please answer: ${q.questionText}`;
      if (q.answer === 'no' && !q.reason.trim()) {
        return `Please give a reason for: ${q.questionText}`;
      }
    }
    return null;
  }

  function goNext() {
    setError('');
    const validationError = validateCurrentStage();
    if (validationError) {
      setError(validationError);
      return;
    }
    setStageIndex((i) => i + 1);
  }

  function goBack() {
    setError('');
    setStageIndex((i) => Math.max(0, i - 1));
  }

  async function handleSubmit() {
    setError('');

    const validationError = validateCurrentStage();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/audits', {
        atmId: selectedAtm.atmId,
        area: selectedAtm.area?.name,
        photos,
        stages,
      });
      if (user?.id) clearDraft(user.id);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit audit');
    } finally {
      setSubmitting(false);
    }
  }

  function startNewAudit() {
    setSelectedAtm(null);
    setAtmSearch('');
    setPhotos([]);
    setStarted(false);
    setStages(buildInitialStages(checklistStages));
    setStageIndex(0);
    setSuccess(false);
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
        <div className="card" style={{ textAlign: 'center', maxWidth: 440, padding: 32 }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
          <h1 style={{ margin: '0 0 8px' }}>Audit Submitted!</h1>
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
              📋 View Submitted Audits
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
          <span className="user-chip">
            {user?.name} <span className="role-badge">Auditor</span>
          </span>
          <button className="link" onClick={logout}>
            Logout
          </button>
        </Topbar>

        <AuditorNav />

        <div className="card wide">
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
        <span className="user-chip">
          <span className="user-chip-name">{user?.name}</span> <span className="role-badge">Auditor</span>
        </span>
        <button className="link" onClick={logout}>
          Logout
        </button>
      </Topbar>

      <div className="card wide">
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

        <div className="stage-tracker" style={{ marginTop: 20 }}>
          {stages.map((stage, i) => (
            <span
              key={stage.stageId}
              className={
                i === stageIndex ? 'stage-pill active' : i < stageIndex ? 'stage-pill done' : 'stage-pill'
              }
            >
              {i + 1}. {stage.stageName}
            </span>
          ))}
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

        <div className="actions">
          <button className="btn-secondary" onClick={goBack} disabled={stageIndex === 0}>
            Back
          </button>
          {!isLastStage ? (
            <button onClick={goNext}>Next</button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Audit'}
            </button>
          )}
        </div>
      </div>

      {cameraTarget && <CameraCapture onCapture={handleCameraCapture} onClose={() => setCameraTarget(null)} />}
      {lightboxPhoto && <PhotoLightbox src={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />}
    </div>
  );
}
