import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AdminNav from '../components/AdminNav';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Delete modal state
  const [auditToDelete, setAuditToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }

  useEffect(() => {
    api
      .get('/audits')
      .then((res) => setAudits(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load audits'))
      .finally(() => setLoading(false));
  }, []);

  const filteredAudits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return audits;
    return audits.filter(
      (a) =>
        a.atmId?.toLowerCase().includes(q) ||
        a.area?.toLowerCase().includes(q) ||
        a.auditor?.name?.toLowerCase().includes(q) ||
        a.auditor?.username?.toLowerCase().includes(q)
    );
  }, [audits, search]);

  async function confirmDelete() {
    if (!auditToDelete) return;
    setDeleting(true);
    setFeedback(null);
    try {
      await api.delete(`/audits/${auditToDelete._id}`);
      setAudits((prev) => prev.filter((a) => a._id !== auditToDelete._id));
      setFeedback({
        type: 'success',
        message: `Audit for ATM ${auditToDelete.atmId} was deleted successfully. ATM is now reset to pending.`,
      });
      setAuditToDelete(null);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to delete audit',
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <Topbar>
        <span className="user-chip">
          <span className="user-chip-name">{user?.name}</span> <span className="role-badge">Admin</span>
        </span>
        <button className="link" onClick={logout}>
          Logout
        </button>
      </Topbar>
      <AdminNav />

      <div className="card wide">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0 }}>All Audits</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              View, inspect details, or delete submitted ATM inspection audits.
            </p>
          </div>
          <span
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              background: '#eff6ff',
              color: '#1d4ed8',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            📊 Total Audits: {audits.length}
          </span>
        </div>

        {feedback && (
          <div
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              marginBottom: 16,
              fontSize: '0.9rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: feedback.type === 'success' ? '#dcfce7' : '#fee2e2',
              color: feedback.type === 'success' ? '#15803d' : '#b91c1c',
              border: feedback.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
            }}
          >
            <span>{feedback.type === 'success' ? '✅' : '⚠️'} {feedback.message}</span>
            <button
              onClick={() => setFeedback(null)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
                fontWeight: 700,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Search Input Bar */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="🔍 Search audits by ATM ID, area, or auditor name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              maxWidth: 480,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              fontSize: '0.9rem',
            }}
          />
        </div>

        {loading && <p>Loading audits...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && audits.length === 0 && <p className="empty-state">No audits submitted yet.</p>}
        {!loading && audits.length > 0 && filteredAudits.length === 0 && (
          <p className="empty-state">No audits match "{search}".</p>
        )}

        {filteredAudits.length > 0 && (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>ATM ID</th>
                  <th>Area</th>
                  <th>Auditor</th>
                  <th>Submitted At</th>
                  <th>Stages Audited</th>
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
                          fontSize: '0.92rem',
                          color: 'var(--color-primary)',
                          background: 'rgba(37, 99, 235, 0.08)',
                          padding: '3px 8px',
                          borderRadius: 6,
                        }}
                      >
                        {audit.atmId}
                      </span>
                    </td>
                    <td>
                      <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', fontSize: '0.85rem', color: '#334155' }}>
                        📍 {audit.area || 'General'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{audit.auditor?.name || 'Unknown'}</span>
                        {audit.auditor?.username && (
                          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>@{audit.auditor.username}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ color: '#475569', fontSize: '0.88rem' }}>
                      {new Date(audit.createdAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: audit.stages?.length >= 3 ? '#dcfce7' : audit.stages?.length === 2 ? '#eff6ff' : '#fef3c7',
                          color: audit.stages?.length >= 3 ? '#15803d' : audit.stages?.length === 2 ? '#1d4ed8' : '#b45309',
                          border: audit.stages?.length >= 3 ? '1px solid #bbf7d0' : audit.stages?.length === 2 ? '1px solid #bfdbfe' : '1px solid #fde68a',
                        }}
                      >
                        {audit.stages?.length >= 3
                          ? '✅ 3/3 Stages'
                          : audit.stages?.length === 2
                          ? '📋 Stages 1 & 2'
                          : audit.stages?.length === 1
                          ? '📦 Stage 1 (Hardware)'
                          : `${audit.stages?.length || 0} Stages`}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                        <Link
                          to={`/admin/audits/${audit._id}`}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            borderRadius: 6,
                            background: '#f8fafc',
                            color: 'var(--color-primary)',
                            border: '1px solid var(--color-border)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          👁 View
                        </Link>
                        <button
                          type="button"
                          onClick={() => setAuditToDelete(audit)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            borderRadius: 6,
                            background: '#fef2f2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title="Delete this audit report"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {auditToDelete && (
        <div
          className="modal-backdrop"
          onClick={() => !deleting && setAuditToDelete(null)}
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
              <div><strong>ATM ID:</strong> {auditToDelete.atmId}</div>
              <div><strong>Area:</strong> {auditToDelete.area || 'General'}</div>
              <div><strong>Auditor:</strong> {auditToDelete.auditor?.name} (@{auditToDelete.auditor?.username})</div>
              <div><strong>Submitted:</strong> {new Date(auditToDelete.createdAt).toLocaleString()}</div>
            </div>

            <p style={{ color: '#b91c1c', background: '#fef2f2', padding: '10px 14px', borderRadius: 8, fontSize: '0.84rem', margin: '0 0 20px', border: '1px solid #fecaca' }}>
              ⚠️ Deleting this audit will remove all inspection answers, attached photos, and reset ATM <strong>{auditToDelete.atmId}</strong> back to pending status.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setAuditToDelete(null)}
                disabled={deleting}
                style={{ padding: '8px 16px', borderRadius: 8 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
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
    </div>
  );
}
