import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AuditorNav from '../components/AuditorNav';
import PhotoLightbox from '../components/PhotoLightbox';

export default function AuditorDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [audits, setAudits] = useState([]);
  const [assignedAtms, setAssignedAtms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Audit detail modal
  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [detailAudit, setDetailAudit] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/audits/mine'),
      api.get('/atms/mine'),
    ])
      .then(([auditsRes, atmsRes]) => {
        setAudits(auditsRes.data || []);
        setAssignedAtms(atmsRes.data || []);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load your audits');
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch single audit detail for modal
  function openAuditDetail(auditId) {
    setSelectedAuditId(auditId);
    setDetailError('');

    // Pre-populate immediately from local state if available
    const local = audits.find((a) => String(a._id) === String(auditId));
    if (local) {
      setDetailAudit(local);
    }

    setLoadingDetail(true);
    api.get(`/audits/${auditId}`)
      .then((res) => {
        setDetailAudit(res.data);
      })
      .catch((err) => {
        console.error('Audit detail fetch error:', err);
        if (!local) {
          setDetailError(err.response?.data?.message || 'Failed to load audit details');
        }
      })
      .finally(() => {
        setLoadingDetail(false);
      });
  }

  function closeAuditDetail() {
    setSelectedAuditId(null);
    setDetailAudit(null);
    setDetailError('');
  }

  // Filtered audits
  const filteredAudits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return audits;
    return audits.filter(
      (a) =>
        a.atmId?.toLowerCase().includes(q) ||
        a.area?.toLowerCase().includes(q)
    );
  }, [audits, search]);

  // Statistics
  const stats = useMemo(() => {
    const totalSubmitted = audits.length;
    const totalAssigned = assignedAtms.length;
    const uniqueZones = new Set(audits.map((a) => a.area).filter(Boolean)).size;
    return { totalSubmitted, totalAssigned, uniqueZones };
  }, [audits, assignedAtms]);

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
        {/* Header & Action */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem' }}>My Audits & Tasks</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Track all ATM inspections submitted by you and view assigned ATMs.
            </p>
          </div>

          <button
            onClick={() => navigate('/audit/new')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              fontSize: '0.95rem',
              fontWeight: 600,
              borderRadius: 8,
            }}
          >
            ➕ Start New Audit
          </button>
        </div>

        {/* KPI Stat Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(37, 99, 235, 0.02))',
              border: '1px solid rgba(37, 99, 235, 0.2)',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
              Audits Submitted
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: 4 }}>
              {stats.totalSubmitted}
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.02))',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
              Assigned ATMs
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#059669', marginTop: 4 }}>
              {stats.totalAssigned}
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(139, 92, 246, 0.02))',
              border: '1px solid rgba(139, 92, 246, 0.2)',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
              Zones Covered
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#7c3aed', marginTop: 4 }}>
              {stats.uniqueZones}
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="🔍 Search submitted audits by ATM ID or Area..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              maxWidth: 400,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              fontSize: '0.95rem',
            }}
          />
        </div>

        {loading && <p style={{ color: 'var(--color-text-muted)', padding: '20px 0' }}>Loading your audits...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && audits.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              background: '#f8fafc',
              borderRadius: 12,
              border: '1px dashed var(--color-border)',
              margin: '20px 0',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--color-text)' }}>No Audits Submitted Yet</h3>
            <p style={{ color: 'var(--color-text-muted)', margin: '0 0 20px', fontSize: '0.95rem' }}>
              You haven't conducted any audits yet. Start inspecting your assigned ATMs today!
            </p>
            <button
              onClick={() => navigate('/audit/new')}
              style={{ padding: '10px 24px', fontSize: '0.95rem' }}
            >
              ➕ Start Your First Audit
            </button>
          </div>
        )}

        {!loading && audits.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>ATM ID</th>
                  <th>Area / Zone</th>
                  <th>Submitted Date & Time</th>
                  <th>Photos</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudits.map((audit) => (
                  <tr key={audit._id}>
                    <td>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          color: 'var(--color-primary)',
                          background: 'rgba(37, 99, 235, 0.08)',
                          padding: '4px 8px',
                          borderRadius: 6,
                        }}
                      >
                        {audit.atmId}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          background: '#f1f5f9',
                          color: '#334155',
                        }}
                      >
                        {audit.area}
                      </span>
                    </td>
                    <td>
                      {new Date(audit.createdAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.85rem',
                          color: '#475569',
                        }}
                      >
                        📸 {audit.photos?.length || 0} photo(s)
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => openAuditDetail(audit._id)}
                        style={{
                          padding: '6px 14px',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          borderRadius: 6,
                          background: '#f8fafc',
                          color: 'var(--color-primary)',
                          border: '1px solid var(--color-border)',
                          cursor: 'pointer',
                        }}
                      >
                        👁 View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Assigned ATMs Quick List */}
        {assignedAtms.length > 0 && (
          <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid var(--color-border)' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: 12 }}>Your Assigned ATMs ({assignedAtms.length})</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: 16 }}>
              Quickly launch an inspection for any ATM assigned to you by the administrator.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 12,
              }}
            >
              {assignedAtms.map((atm) => (
                <div
                  key={atm._id || atm.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    background: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: 'var(--color-text)', fontFamily: 'monospace' }}>
                        {atm.atmId}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: '#e0f2fe',
                          color: '#0369a1',
                          fontWeight: 600,
                        }}
                      >
                        {atm.area?.name || atm.zone || 'General'}
                      </span>
                    </div>
                    {atm.branchName && (
                      <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: 4 }}>
                        {atm.branchName}
                      </div>
                    )}
                    {atm.vendor && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        Vendor: {atm.vendor}
                      </div>
                    )}
                    {atm.address && (
                      <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 5, lineHeight: 1.35, wordBreak: 'break-word' }}>
                        📍 {atm.address} {atm.pincode ? `(PIN: ${atm.pincode})` : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button
                      onClick={() => navigate(`/audit/new?atmId=${atm.atmId}`)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        borderRadius: 6,
                      }}
                    >
                      Audit This ATM &rarr;
                    </button>
                    {((atm.links && atm.links.length > 0) ? atm.links : atm.link ? [atm.link] : []).map((l, i, arr) => (
                      <a
                        key={i}
                        href={l}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open Installation / Reference Link ${arr.length > 1 ? `#${i + 1}` : ''} in new tab`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '8px 10px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          borderRadius: 6,
                          background: '#f0f9ff',
                          color: '#0284c7',
                          border: '1px solid #bae6fd',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        🔗 Link {arr.length > 1 ? `${i + 1}` : ''} ↗
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Audit Detail Modal */}
      {selectedAuditId && (
        <div
          className="modal-backdrop"
          onClick={closeAuditDetail}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              background: '#ffffff',
              borderRadius: 16,
              maxWidth: 720,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              margin: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: 16,
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>
                  Audit Details: {detailAudit?.atmId || 'Loading...'}
                </h2>
                {detailAudit && (
                  <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    Zone: <strong>{detailAudit.area}</strong> &bull; Submitted:{' '}
                    {new Date(detailAudit.createdAt).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                onClick={closeAuditDetail}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  fontSize: '1.25rem',
                  borderRadius: '50%',
                  width: 36,
                  height: 36,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                }}
              >
                ✕
              </button>
            </div>

            {loadingDetail && <p style={{ padding: '20px 0', textAlign: 'center' }}>Loading audit details...</p>}
            {detailError && <p className="error">{detailError}</p>}

            {detailAudit && !loadingDetail && (
              <div>
                {/* Captured Photos Gallery */}
                <h3 style={{ fontSize: '1.05rem', margin: '0 0 12px' }}>ATM Overview Photos</h3>
                {detailAudit.photos?.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                      gap: 10,
                      marginBottom: 24,
                    }}
                  >
                    {detailAudit.photos.map((p, i) => (
                      <div
                        key={i}
                        onClick={() => setLightboxPhoto(p)}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 8,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          border: '1px solid var(--color-border)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        }}
                      >
                        <img
                          src={p}
                          alt={`ATM photo ${i + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: 20 }}>
                    No photos recorded.
                  </p>
                )}

                {/* Stages & Checklist Responses */}
                <h3 style={{ fontSize: '1.05rem', margin: '0 0 12px' }}>Checklist Inspection Results</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {detailAudit.stages?.map((stage, sIdx) => {
                    const questions = stage.questions || stage.responses || [];
                    return (
                      <div
                        key={sIdx}
                        style={{
                          borderRadius: 10,
                          border: '1px solid var(--color-border)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            padding: '10px 14px',
                            background: '#f8fafc',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            color: '#1e293b',
                            borderBottom: '1px solid var(--color-border)',
                          }}
                        >
                          {stage.stageName} {questions.length > 0 ? `(${questions.length} items)` : ''}
                        </div>
                        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {questions.length === 0 ? (
                            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: 0 }}>
                              No responses recorded for this section.
                            </p>
                          ) : (
                            questions.map((q, qIdx) => {
                              const qText = q.questionText || q.text || `Question ${qIdx + 1}`;
                              const ans = (q.answer || 'na').toLowerCase();
                              return (
                                <div
                                  key={qIdx}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                    paddingBottom: 10,
                                    borderBottom:
                                      qIdx < questions.length - 1 ? '1px dashed #f1f5f9' : 'none',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                    <span style={{ fontSize: '0.9rem', color: '#334155' }}>
                                      {qText}
                                    </span>
                                    <span
                                      style={{
                                        padding: '2px 8px',
                                        borderRadius: 4,
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        background: ans === 'yes' ? '#dcfce7' : ans === 'no' ? '#fee2e2' : '#f1f5f9',
                                        color: ans === 'yes' ? '#15803d' : ans === 'no' ? '#b91c1c' : '#64748b',
                                        alignSelf: 'flex-start',
                                      }}
                                    >
                                      {ans}
                                    </span>
                                  </div>
                                  {ans === 'no' && q.reason && (
                                    <div
                                      style={{
                                        fontSize: '0.85rem',
                                        color: '#dc2626',
                                        background: '#fef2f2',
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                      }}
                                    >
                                      <strong>Reason:</strong> {q.reason}
                                    </div>
                                  )}
                                  {q.photos?.length > 0 && (
                                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                      {q.photos.map((qp, qpi) => (
                                        <img
                                          key={qpi}
                                          src={qp}
                                          alt="Question issue photo"
                                          onClick={() => setLightboxPhoto(qp)}
                                          style={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: 6,
                                            objectFit: 'cover',
                                            cursor: 'pointer',
                                            border: '1px solid var(--color-border)',
                                          }}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 24, textAlign: 'right' }}>
                  <button
                    onClick={closeAuditDetail}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 8,
                      background: '#f1f5f9',
                      border: '1px solid var(--color-border)',
                      color: '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox for zooming photos */}
      {lightboxPhoto && (
        <PhotoLightbox src={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
      )}
    </div>
  );
}
