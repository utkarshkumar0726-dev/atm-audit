import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AuditorNav from '../components/AuditorNav';

export default function AuditorDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [audits, setAudits] = useState([]);
  const [assignedAtms, setAssignedAtms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

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
        setError(err.response?.data?.message || 'Failed to load assigned ATMs');
      })
      .finally(() => setLoading(false));
  }, []);

  // Set of normalized ATM IDs that have been audited by this auditor
  const auditedAtmIds = useMemo(() => {
    return new Set(audits.map((a) => String(a.atmId || '').trim().toLowerCase()));
  }, [audits]);

  // Pending assigned ATMs: ONLY ATMs that have NOT been audited yet!
  // Once an ATM is audited, it is automatically removed from the main page.
  const pendingAtms = useMemo(() => {
    return assignedAtms.filter((atm) => {
      const key = String(atm.atmId || '').trim().toLowerCase();
      return !auditedAtmIds.has(key) && !atm.isAudited;
    });
  }, [assignedAtms, auditedAtmIds]);

  // Filtered pending ATMs by search query
  const filteredPendingAtms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pendingAtms;
    return pendingAtms.filter(
      (a) =>
        a.atmId?.toLowerCase().includes(q) ||
        a.branchName?.toLowerCase().includes(q) ||
        a.vendor?.toLowerCase().includes(q) ||
        a.address?.toLowerCase().includes(q) ||
        a.zone?.toLowerCase().includes(q) ||
        a.area?.name?.toLowerCase().includes(q)
    );
  }, [pendingAtms, search]);

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
        {/* Header */}
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
            <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Assigned ATMs</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Pending ATM inspections assigned to you. Click "Audit This ATM" to begin an audit.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => navigate('/auditor/audits')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 16px',
                fontSize: '0.9rem',
                fontWeight: 600,
                borderRadius: 8,
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
              }}
            >
              📋 View Submitted Audits ({audits.length})
            </button>
            <button
              onClick={() => navigate('/audit/new')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 18px',
                fontSize: '0.9rem',
                fontWeight: 600,
                borderRadius: 8,
              }}
            >
              ➕ Start New Audit
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.12), rgba(2, 132, 199, 0.04))',
              border: '1px solid #38bdf8',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: '#0369a1', fontWeight: 600 }}>
              ⏳ Pending Inspections
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0284c7', marginTop: 4 }}>
              {pendingAtms.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
              Awaiting audit on this page
            </div>
          </div>

          <div
            onClick={() => navigate('/auditor/audits')}
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: '#ffffff',
              border: '1px solid var(--color-border)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: 600 }}>
              ✅ Audits Completed
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#059669', marginTop: 4 }}>
              {audits.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#0284c7', marginTop: 2, fontWeight: 500 }}>
              View in Submitted Audits &rarr;
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
              📍 Total Assigned
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#7c3aed', marginTop: 4 }}>
              {assignedAtms.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
              Total allotted by Admin
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="🔍 Search pending ATMs by ATM ID, Branch, Area, Vendor, Address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              maxWidth: 480,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              fontSize: '0.95rem',
            }}
          />
        </div>

        {loading && (
          <p style={{ color: 'var(--color-text-muted)', padding: '24px 0' }}>
            Loading your assigned ATMs...
          </p>
        )}
        {error && <p className="error">{error}</p>}

        {/* Pending Assigned ATMs Grid */}
        {!loading && (
          <div>
            {pendingAtms.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '48px 20px',
                  background: '#f8fafc',
                  borderRadius: 12,
                  border: '1px dashed var(--color-border)',
                  margin: '10px 0',
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>
                  {assignedAtms.length > 0 ? '🎉' : '📍'}
                </div>
                <h3 style={{ margin: '0 0 8px', color: 'var(--color-text)' }}>
                  {assignedAtms.length > 0
                    ? 'All Assigned ATMs Have Been Audited!'
                    : 'No ATMs Currently Assigned'}
                </h3>
                <p style={{ color: 'var(--color-text-muted)', margin: '0 0 20px', fontSize: '0.95rem', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
                  {assignedAtms.length > 0
                    ? 'All assigned ATMs for your account have been successfully audited and moved to the Submitted Audits page. No pending ATMs remain on this main page.'
                    : 'You do not have any ATMs assigned right now. Please reach out to your administrator to assign ATM sites.'}
                </p>
                {audits.length > 0 && (
                  <button
                    onClick={() => navigate('/auditor/audits')}
                    style={{ padding: '10px 24px', fontSize: '0.95rem', borderRadius: 8 }}
                  >
                    📋 View Submitted Audits ({audits.length})
                  </button>
                )}
              </div>
            ) : filteredPendingAtms.length === 0 ? (
              <p className="empty-state">No pending ATMs match your search query "{search}".</p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 16,
                }}
              >
                {filteredPendingAtms.map((atm) => (
                  <div
                    key={atm._id || atm.id}
                    style={{
                      padding: '16px 18px',
                      borderRadius: 12,
                      border: '1px solid var(--color-border)',
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-text)', fontFamily: 'monospace', fontSize: '1.05rem' }}>
                          {atm.atmId}
                        </span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {atm.vendor && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: '#fef3c7',
                                color: '#b45309',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                              }}
                            >
                              {atm.vendor}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: '#e0f2fe',
                              color: '#0369a1',
                              fontWeight: 600,
                            }}
                          >
                            {atm.area?.name || atm.zone || 'General'}
                          </span>
                        </div>
                      </div>

                      {atm.branchName && (
                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', marginTop: 6 }}>
                          {atm.branchName}
                        </div>
                      )}

                      {atm.address && (
                        <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 6, lineHeight: 1.4, wordBreak: 'break-word' }}>
                          📍 {atm.address} {atm.pincode ? `(PIN: ${atm.pincode})` : ''}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                      <button
                        onClick={() => navigate(`/audit/new?atmId=${atm.atmId}`)}
                        style={{
                          flex: 1,
                          padding: '9px 12px',
                          fontSize: '0.88rem',
                          fontWeight: 600,
                          borderRadius: 8,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
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
                          title={`Open Reference Link ${arr.length > 1 ? `#${i + 1}` : ''}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '8px 10px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            borderRadius: 8,
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
