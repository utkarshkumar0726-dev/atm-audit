import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import Topbar from '../components/Topbar';
import PhotoLightbox from '../components/PhotoLightbox';

export default function AdminAuditDetail() {
  const { id } = useParams();
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  useEffect(() => {
    api
      .get(`/audits/${id}`)
      .then((res) => setAudit(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load audit'));
  }, [id]);

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
        <h1>Audit Detail</h1>
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

      {lightboxPhoto && <PhotoLightbox src={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />}
    </div>
  );
}
