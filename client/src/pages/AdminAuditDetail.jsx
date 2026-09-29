import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import Topbar from '../components/Topbar';
import PhotoLightbox from '../components/PhotoLightbox';

export default function AdminAuditDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    api
      .get(`/audits/${id}`)
      .then((res) => setAudit(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load audit'));
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/audits/${id}`);
      navigate('/admin');
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete audit');
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <div className="page-center">
        <div className="card">
          <p className="error">{error}</p>
          <Link to="/admin">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="page-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <Topbar>
        <Link to="/admin" className="link">
          &larr; Back to dashboard
        </Link>
      </Topbar>

      <div className="card wide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0 }}>Audit Detail</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Full checklist inspection report for ATM <strong>{audit.atmId}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🗑️ Delete Audit
          </button>
        </div>

        <p>
          <strong>ATM ID:</strong> {audit.atmId}
        </p>
        <p>
          <strong>Area:</strong> {audit.area}
        </p>
        <p>
          <strong>Auditor:</strong> {audit.auditor?.name} ({audit.auditor?.username})
        </p>
        <p>
          <strong>Submitted:</strong> {new Date(audit.createdAt).toLocaleString()}
        </p>
        <p>
          <strong>Stages Audited:</strong>{' '}
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              fontSize: '0.85rem',
              fontWeight: 700,
              background: audit.stages?.length >= 3 ? '#dcfce7' : '#eff6ff',
              color: audit.stages?.length >= 3 ? '#15803d' : '#1d4ed8',
              border: audit.stages?.length >= 3 ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
            }}
          >
            {audit.stages?.length >= 3
              ? '✅ Full Audit (All 3 Stages)'
              : audit.stages?.length === 2
              ? '📋 Stages 1 & 2 Completed'
              : audit.stages?.length === 1
              ? '📦 Stage 1 (Hardware Verification) Only'
              : `${audit.stages?.length || 0} Stages`}
          </span>
        </p>

        {audit.photos?.length > 0 && (
          <div className="photo-grid photo-grid-view">
            {audit.photos.map((p, i) => (
              <div className="photo-grid-item" key={i}>
                <img src={p} alt={`ATM ${audit.atmId} ${i + 1}`} onClick={() => setLightboxPhoto(p)} />
              </div>
            ))}
          </div>
        )}

        {audit.stages.map((stage) => (
          <div key={stage.stageId} className="stage-block">
            <h2>{stage.stageName}</h2>
            {stage.questions.map((q) => (
              <div className="question readonly" key={q.questionId}>
                <p>{q.questionText}</p>
                <p className={q.answer === 'yes' ? 'answer-yes' : 'answer-no'}>{q.answer.toUpperCase()}</p>
                {q.answer === 'no' && <p className="reason">Reason: {q.reason}</p>}
                {q.photos?.length > 0 && (
                  <div className="photo-grid photo-grid-view">
                    {q.photos.map((p, i) => (
                      <div className="photo-grid-item" key={i}>
                        <img src={p} alt="Attached" onClick={() => setLightboxPhoto(p)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {audit.stages?.length < 3 && (
          <div
            style={{
              marginTop: 20,
              padding: '12px 16px',
              borderRadius: 8,
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              color: '#64748b',
              fontSize: '0.9rem',
            }}
          >
            ℹ️ <strong>Partial Audit:</strong> Only {audit.stages.length} of 3 stages were submitted for this inspection. Remaining stages were not included.
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="modal-backdrop"
          onClick={() => !deleting && setShowDeleteModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 480,
              width: '100%',
              background: '#ffffff',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  flexShrink: 0,
                }}
              >
                🗑️
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Delete Audit Report?</h3>
                <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                  This action is permanent and cannot be undone.
                </p>
              </div>
            </div>

            {deleteError && (
              <p className="error" style={{ marginBottom: 12 }}>
                {deleteError}
              </p>
            )}

            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                marginBottom: 16,
                fontSize: '0.88rem',
                lineHeight: 1.6,
              }}
            >
              <div><strong>ATM ID:</strong> {audit.atmId}</div>
              <div><strong>Area:</strong> {audit.area || 'General'}</div>
              <div><strong>Auditor:</strong> {audit.auditor?.name} (@{audit.auditor?.username})</div>
              <div><strong>Submitted:</strong> {new Date(audit.createdAt).toLocaleString()}</div>
            </div>

            <p style={{ color: '#b91c1c', background: '#fef2f2', padding: '10px 14px', borderRadius: 8, fontSize: '0.84rem', margin: '0 0 20px', border: '1px solid #fecaca' }}>
              ⚠️ Deleting this audit will remove all inspection answers, attached photos, and reset ATM <strong>{audit.atmId}</strong> back to pending status.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{ padding: '8px 16px', borderRadius: 8 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  background: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Audit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxPhoto && <PhotoLightbox src={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />}
    </div>
  );
}

