import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'audited'
  const [vendorFilter, setVendorFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Audit report modal (for audited ATMs)
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
        setError(err.response?.data?.message || 'Failed to load assigned ATMs');
      })
      .finally(() => setLoading(false));
  }, []);

  // Map of normalized ATM ID -> Audit object
  const auditByAtmId = useMemo(() => {
    const map = new Map();
    audits.forEach((a) => {
      if (a.atmId) {
        map.set(String(a.atmId).trim().toLowerCase(), a);
      }
    });
    return map;
  }, [audits]);

  // Set of audited ATM IDs
  const auditedAtmIds = useMemo(() => {
    return new Set(audits.map((a) => String(a.atmId || '').trim().toLowerCase()));
  }, [audits]);

  // Unique vendors for filter dropdown
  const uniqueVendors = useMemo(() => {
    const set = new Set();
    assignedAtms.forEach((a) => {
      if (a.vendor) set.add(a.vendor);
    });
    return Array.from(set).sort();
  }, [assignedAtms]);

  // Categorize ATMs
  const { pendingAtms, auditedAtms } = useMemo(() => {
    const pending = [];
    const audited = [];
    assignedAtms.forEach((atm) => {
      const key = String(atm.atmId || '').trim().toLowerCase();
      if (auditedAtmIds.has(key) || atm.isAudited) {
        audited.push(atm);
      } else {
        pending.push(atm);
      }
    });
    return { pendingAtms: pending, auditedAtms: audited };
  }, [assignedAtms, auditedAtmIds]);

  // Filtered ATMs based on statusFilter, vendorFilter, search
  const filteredAtms = useMemo(() => {
    let list = assignedAtms;

    if (statusFilter === 'pending') {
      list = pendingAtms;
    } else if (statusFilter === 'audited') {
      list = auditedAtms;
    }

    if (vendorFilter !== 'all') {
      list = list.filter((a) => a.vendor === vendorFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.atmId?.toLowerCase().includes(q) ||
          a.branchName?.toLowerCase().includes(q) ||
          a.vendor?.toLowerCase().includes(q) ||
          a.address?.toLowerCase().includes(q) ||
          a.zone?.toLowerCase().includes(q) ||
          a.area?.name?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [assignedAtms, pendingAtms, auditedAtms, statusFilter, vendorFilter, search]);

  // Open audit detail modal for an ATM
  function openAuditReport(atmId) {
    const key = String(atmId || '').trim().toLowerCase();
    const audit = auditByAtmId.get(key);
    if (!audit) {
      navigate(`/auditor/audits?search=${atmId}`);
      return;
    }

    setSelectedAuditId(audit._id);
    setDetailAudit(audit);
    setDetailError('');
    setLoadingDetail(true);

    api.get(`/audits/${audit._id}`)
      .then((res) => {
        setDetailAudit(res.data);
      })
      .catch((err) => {
        console.error('Audit detail fetch error:', err);
        if (!audit) {
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
              All ATM sites assigned to you by the administrator for surveillance and audit inspection.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
              📋 Submitted Audits ({audits.length})
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
            onClick={() => setStatusFilter('all')}
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: statusFilter === 'all'
                ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(99, 102, 241, 0.04))'
                : '#ffffff',
              border: statusFilter === 'all'
                ? '1px solid #818cf8'
                : '1px solid var(--color-border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: '#4338ca', fontWeight: 600 }}>
              📍 Total Assigned
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#4f46e5', marginTop: 4 }}>
              {assignedAtms.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
              All ATM sites allotted to you
            </div>
          </div>

          <div
            onClick={() => setStatusFilter('pending')}
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: statusFilter === 'pending'
                ? 'linear-gradient(135deg, rgba(2, 132, 199, 0.12), rgba(2, 132, 199, 0.04))'
                : '#ffffff',
              border: statusFilter === 'pending'
                ? '1px solid #38bdf8'
                : '1px solid var(--color-border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: '#0369a1', fontWeight: 600 }}>
              ⏳ Pending Audit
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0284c7', marginTop: 4 }}>
              {pendingAtms.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
              Awaiting inspection
            </div>
          </div>

          <div
            onClick={() => setStatusFilter('audited')}
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: statusFilter === 'audited'
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.04))'
                : '#ffffff',
              border: statusFilter === 'audited'
                ? '1px solid #34d399'
                : '1px solid var(--color-border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: 600 }}>
              ✅ Audited / Completed
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#059669', marginTop: 4 }}>
              {auditedAtms.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
              Inspections completed
            </div>
          </div>
        </div>

        {/* Filter Pills & Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 20,
            paddingBottom: 14,
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {/* Status Filter Pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: '0.86rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: statusFilter === 'all' ? '1px solid #4f46e5' : '1px solid #e2e8f0',
                background: statusFilter === 'all' ? '#eef2ff' : '#ffffff',
                color: statusFilter === 'all' ? '#4338ca' : '#64748b',
                transition: 'all 0.15s ease',
              }}
            >
              <span>📍 All Assigned</span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontSize: '0.75rem',
                  background: statusFilter === 'all' ? '#4f46e5' : '#f1f5f9',
                  color: statusFilter === 'all' ? '#ffffff' : '#64748b',
                }}
              >
                {assignedAtms.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: '0.86rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: statusFilter === 'pending' ? '1px solid #0284c7' : '1px solid #e2e8f0',
                background: statusFilter === 'pending' ? '#e0f2fe' : '#ffffff',
                color: statusFilter === 'pending' ? '#0369a1' : '#64748b',
                transition: 'all 0.15s ease',
              }}
            >
              <span>⏳ Pending</span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontSize: '0.75rem',
                  background: statusFilter === 'pending' ? '#0284c7' : '#f1f5f9',
                  color: statusFilter === 'pending' ? '#ffffff' : '#64748b',
                }}
              >
                {pendingAtms.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('audited')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: '0.86rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: statusFilter === 'audited' ? '1px solid #059669' : '1px solid #e2e8f0',
                background: statusFilter === 'audited' ? '#ecfdf5' : '#ffffff',
                color: statusFilter === 'audited' ? '#047857' : '#64748b',
                transition: 'all 0.15s ease',
              }}
            >
              <span>✅ Audited</span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontSize: '0.75rem',
                  background: statusFilter === 'audited' ? '#059669' : '#f1f5f9',
                  color: statusFilter === 'audited' ? '#ffffff' : '#64748b',
                }}
              >
                {auditedAtms.length}
              </span>
            </button>
          </div>

          {/* Vendor Filter */}
          {uniqueVendors.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Vendor:</span>
              <select
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  fontSize: '0.86rem',
                  background: '#ffffff',
                  color: '#1e293b',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Vendors ({assignedAtms.length})</option>
                {uniqueVendors.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="🔍 Search assigned ATMs by ATM ID, Branch, Area, Vendor, Address..."
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

        {/* ATMs Grid */}
        {!loading && (
          <div>
            {assignedAtms.length === 0 ? (
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
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>📍</div>
                <h3 style={{ margin: '0 0 8px', color: 'var(--color-text)' }}>
                  No ATMs Assigned Yet
                </h3>
                <p style={{ color: 'var(--color-text-muted)', margin: '0 0 20px', fontSize: '0.95rem', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
                  You currently have no ATMs assigned to your account. Please contact your administrator to assign ATM sites for surveillance audit.
                </p>
              </div>
            ) : filteredAtms.length === 0 ? (
              <p className="empty-state">
                No assigned ATMs found matching the selected filters or search query "{search}".
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                  gap: 16,
                }}
              >
                {filteredAtms.map((atm) => {
                  const key = String(atm.atmId || '').trim().toLowerCase();
                  const isAudited = auditedAtmIds.has(key) || atm.isAudited;
                  const auditObj = auditByAtmId.get(key);

                  return (
                    <div
                      key={atm._id || atm.id}
                      style={{
                        padding: '16px 18px',
                        borderRadius: 12,
                        border: isAudited
                          ? '1px solid #bbf7d0'
                          : '1px solid var(--color-border)',
                        background: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 12,
                        boxShadow: isAudited
                          ? '0 1px 3px rgba(16, 185, 129, 0.08)'
                          : '0 1px 3px rgba(0, 0, 0, 0.04)',
                        position: 'relative',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      }}
                    >
                      <div>
                        {/* Card Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div>
                            <span style={{ fontWeight: 700, color: 'var(--color-text)', fontFamily: 'monospace', fontSize: '1.05rem' }}>
                              {atm.atmId}
                            </span>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
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
                                  fontSize: '0.72rem',
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
                          </div>

                          {/* Status Badge */}
                          {isAudited ? (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: '#dcfce7',
                                color: '#15803d',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              ✓ Audited
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: '#fef3c7',
                                color: '#b45309',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              ⏳ Pending
                            </span>
                          )}
                        </div>

                        {/* Branch Name */}
                        {atm.branchName && (
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', marginTop: 8 }}>
                            {atm.branchName}
                          </div>
                        )}

                        {/* Address */}
                        {atm.address && (
                          <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 6, lineHeight: 1.4, wordBreak: 'break-word' }}>
                            📍 {atm.address} {atm.pincode ? `(PIN: ${atm.pincode})` : ''}
                          </div>
                        )}

                        {/* Incharge / Contact */}
                        {atm.inchargeName && (
                          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6 }}>
                            👤 Incharge: {atm.inchargeName} {atm.inchargeContact ? `(${atm.inchargeContact})` : ''}
                          </div>
                        )}

                        {/* Audited timestamp note if audited */}
                        {isAudited && (auditObj?.createdAt || atm.lastAuditedAt) && (
                          <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: 6, fontWeight: 500 }}>
                            Audited on: {new Date(auditObj?.createdAt || atm.lastAuditedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>

                      {/* Card Footer Actions */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 10, borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
                        {isAudited ? (
                          <button
                            onClick={() => openAuditReport(atm.atmId)}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              borderRadius: 8,
                              background: '#ecfdf5',
                              color: '#047857',
                              border: '1px solid #a7f3d0',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                            }}
                          >
                            👁 View Report
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/audit/new?atmId=${atm.atmId}`)}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              fontSize: '0.85rem',
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
                        )}

                        {/* Reference / Installation links */}
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
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audit Detail Modal (When viewing report of an audited ATM) */}
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
