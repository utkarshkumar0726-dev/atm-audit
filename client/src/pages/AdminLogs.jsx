import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AdminNav from '../components/AdminNav';

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const past = new Date(dateStr);
  const diffSec = Math.floor((now - past) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

export default function AdminLogs() {
  const { user, logout } = useAuth();

  // Active Tab: 'logins' | 'audits'
  const [activeTab, setActiveTab] = useState('logins');

  // Logs data
  const [loginLogs, setLoginLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters for Login Logs
  const [loginSearch, setLoginSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');

  // Filters for Audit Logs
  const [auditSearch, setAuditSearch] = useState('');

  async function fetchLogs() {
    setLoading(true);
    setError('');
    try {
      const [statsRes, loginsRes, auditsRes] = await Promise.all([
        api.get('/logs/stats'),
        api.get('/logs/logins?limit=500'),
        api.get('/logs/audits?limit=500'),
      ]);
      setStats(statsRes.data);
      setLoginLogs(loginsRes.data || []);
      setAuditLogs(auditsRes.data || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
      setError(err.response?.data?.message || 'Failed to load logs and activity records');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  // Filtered Login Logs
  const filteredLoginLogs = useMemo(() => {
    let list = loginLogs;
    if (roleFilter !== 'all') {
      list = list.filter((l) => l.role?.toLowerCase() === roleFilter.toLowerCase());
    }
    if (actionFilter !== 'all') {
      list = list.filter((l) => l.action?.toUpperCase() === actionFilter.toUpperCase());
    }
    if (loginSearch.trim()) {
      const q = loginSearch.toLowerCase().trim();
      list = list.filter(
        (l) =>
          l.name?.toLowerCase().includes(q) ||
          l.username?.toLowerCase().includes(q) ||
          l.ip?.toLowerCase().includes(q) ||
          l.device?.toLowerCase().includes(q) ||
          l.browser?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [loginLogs, roleFilter, actionFilter, loginSearch]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    let list = auditLogs;
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase().trim();
      list = list.filter(
        (l) =>
          l.atmId?.toLowerCase().includes(q) ||
          l.auditorName?.toLowerCase().includes(q) ||
          l.auditorUsername?.toLowerCase().includes(q) ||
          l.area?.toLowerCase().includes(q) ||
          l.action?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [auditLogs, auditSearch]);

  // Export CSV
  function exportCSV() {
    let headers = [];
    let rows = [];
    let filename = '';

    if (activeTab === 'logins') {
      filename = `ATM_Audit360_Login_Logs_${new Date().toISOString().slice(0, 10)}.csv`;
      headers = ['#', 'Date & Time', 'User Name', 'Username', 'Role', 'Action', 'Device', 'Browser', 'IP Address'];
      rows = filteredLoginLogs.map((l, i) => [
        i + 1,
        `"${new Date(l.createdAt).toISOString()}"`,
        `"${l.name || ''}"`,
        `"${l.username || ''}"`,
        `"${(l.role || '').toUpperCase()}"`,
        `"${l.action || ''}"`,
        `"${l.device || ''}"`,
        `"${l.browser || ''}"`,
        `"${l.ip || ''}"`,
      ]);
    } else {
      filename = `ATM_Audit360_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`;
      headers = ['#', 'Date & Time', 'Auditor Name', 'Auditor Username', 'ATM ID', 'Area / Zone', 'Action', 'Photos Count', 'Stages Count', 'IP Address'];
      rows = filteredAuditLogs.map((l, i) => [
        i + 1,
        `"${new Date(l.createdAt).toISOString()}"`,
        `"${l.auditorName || ''}"`,
        `"${l.auditorUsername || ''}"`,
        `"${l.atmId || ''}"`,
        `"${l.area || ''}"`,
        `"${l.action || ''}"`,
        l.photoCount || 0,
        l.stageCount || 0,
        `"${l.ip || ''}"`,
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        {/* Page Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', letterSpacing: '-0.02em' }}>
              System Logs & Audit Trail
            </h1>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Real-time records of login/logout sessions across the platform and all inspection audit activities performed by auditors.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={fetchLogs}
              title="Refresh logs from server"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 15px',
                borderRadius: 8,
                fontSize: '0.88rem',
                fontWeight: 600,
              }}
            >
              🔄 Refresh Logs
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={exportCSV}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 15px',
                borderRadius: 8,
                fontSize: '0.88rem',
                fontWeight: 600,
              }}
            >
              📥 Export {activeTab === 'logins' ? 'Login' : 'Audit'} CSV
            </button>
          </div>
        </div>

        {/* KPI Metrics */}
        <div className="kpi-grid">
          <div className="kpi-card" style={{ '--kpi-accent': '#2563eb' }}>
            <div className="kpi-header">
              <span className="kpi-label">Total Logins</span>
              <span className="kpi-icon">🔐</span>
            </div>
            <div className="kpi-value">{stats?.totalLoginEvents || loginLogs.filter((l) => l.action === 'LOGIN').length}</div>
            <div className="kpi-subtext">All login sessions tracked</div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': '#0284c7' }}>
            <div className="kpi-header">
              <span className="kpi-label">Auditor Logins</span>
              <span className="kpi-icon">👤</span>
            </div>
            <div className="kpi-value">{stats?.auditorLogins || loginLogs.filter((l) => l.role === 'auditor' && l.action === 'LOGIN').length}</div>
            <div className="kpi-subtext">Auditor logins recorded</div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': '#7c3aed' }}>
            <div className="kpi-header">
              <span className="kpi-label">Admin Logins</span>
              <span className="kpi-icon">👑</span>
            </div>
            <div className="kpi-value">{stats?.adminLogins || loginLogs.filter((l) => l.role === 'admin' && l.action === 'LOGIN').length}</div>
            <div className="kpi-subtext">Admin management sessions</div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': '#059669' }}>
            <div className="kpi-header">
              <span className="kpi-label">Audit Activities</span>
              <span className="kpi-icon">📋</span>
            </div>
            <div className="kpi-value">{stats?.totalAuditLogs || auditLogs.length}</div>
            <div className="kpi-subtext">Audits performed by auditors</div>
          </div>
        </div>

        {/* Tab Selection */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            borderBottom: '2px solid #e2e8f0',
            marginBottom: 20,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('logins')}
            style={{
              padding: '11px 20px',
              fontSize: '0.95rem',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'logins' ? '3px solid #0284c7' : '3px solid transparent',
              color: activeTab === 'logins' ? '#0284c7' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <span>🔐 Login & Logout Logs</span>
            <span
              style={{
                fontSize: '0.74rem',
                padding: '2px 8px',
                borderRadius: 999,
                background: activeTab === 'logins' ? '#e0f2fe' : '#f1f5f9',
                color: activeTab === 'logins' ? '#0369a1' : '#64748b',
              }}
            >
              {filteredLoginLogs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audits')}
            style={{
              padding: '11px 20px',
              fontSize: '0.95rem',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'audits' ? '3px solid #059669' : '3px solid transparent',
              color: activeTab === 'audits' ? '#059669' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <span>📋 Audit Logs (Auditor Only)</span>
            <span
              style={{
                fontSize: '0.74rem',
                padding: '2px 8px',
                borderRadius: 999,
                background: activeTab === 'audits' ? '#dcfce7' : '#f1f5f9',
                color: activeTab === 'audits' ? '#15803d' : '#64748b',
              }}
            >
              {filteredAuditLogs.length}
            </span>
          </button>
        </div>

        {error && <p className="error" style={{ marginBottom: 16 }}>{error}</p>}

        {/* TAB 1: LOGIN & LOGOUT LOGS */}
        {activeTab === 'logins' && (
          <div>
            {/* Filter Bar */}
            <div className="filter-bar">
              <div className="search-input-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search login logs by user name, username, IP, browser, device..."
                  value={loginSearch}
                  onChange={(e) => setLoginSearch(e.target.value)}
                />
                {loginSearch && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => setLoginSearch('')}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem' }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Role Filter */}
              <select
                className="filter-select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">All Roles (Admin & Auditor)</option>
                <option value="admin">Admin Only</option>
                <option value="auditor">Auditor Only</option>
              </select>

              {/* Action Filter */}
              <select
                className="filter-select"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                <option value="all">All Actions (Login & Logout)</option>
                <option value="LOGIN">🟢 Login Only</option>
                <option value="LOGOUT">🚪 Logout Only</option>
              </select>

              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginLeft: 'auto', fontWeight: 600 }}>
                Showing <strong>{filteredLoginLogs.length}</strong> of {loginLogs.length} logs
              </span>
            </div>

            {loading && (
              <p style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Loading system logs...
              </p>
            )}

            {!loading && filteredLoginLogs.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '44px 20px',
                  background: '#f8fafc',
                  borderRadius: 12,
                  border: '1px dashed var(--color-border)',
                }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔐</div>
                <h3 style={{ margin: '0 0 6px' }}>No Login/Logout Logs Found</h3>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  No log entries matched your filter criteria or search query.
                </p>
              </div>
            )}

            {!loading && filteredLoginLogs.length > 0 && (
              <div className="table-responsive">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th style={{ width: 45, textAlign: 'center' }}>#</th>
                      <th>Action</th>
                      <th>User</th>
                      <th>Role</th>
                      <th>Date & Time</th>
                      <th>Device & Browser</th>
                      <th>IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLoginLogs.map((log, idx) => {
                      const isLogin = log.action === 'LOGIN';
                      const isAdmin = log.role === 'admin';
                      return (
                        <tr key={log._id || idx}>
                          <td style={{ textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
                            {idx + 1}
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 10px',
                                borderRadius: 999,
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                background: isLogin ? '#ecfdf5' : '#fef2f2',
                                color: isLogin ? '#047857' : '#b91c1c',
                                border: isLogin ? '1px solid #a7f3d0' : '1px solid #fecaca',
                              }}
                            >
                              <span>{isLogin ? '🟢' : '🚪'}</span>
                              <span>{log.action}</span>
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  background: isAdmin ? '#e0f2fe' : '#f3e8ff',
                                  color: isAdmin ? '#0369a1' : '#7c3aed',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.82rem',
                                }}
                              >
                                {isAdmin ? '👑' : '👤'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.88rem' }}>
                                  {log.name || log.username}
                                </div>
                                <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                                  @{log.username}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                background: isAdmin ? '#e0f2fe' : '#f1f5f9',
                                color: isAdmin ? '#0284c7' : '#475569',
                              }}
                            >
                              {log.role}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: '0.86rem', color: '#1e293b', fontWeight: 500 }}>
                              {formatDateTime(log.createdAt)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 1 }}>
                              {timeAgo(log.createdAt)}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '0.9rem' }}>
                                {log.device === 'Mobile' ? '📱' : log.device === 'Tablet' ? '📟' : '💻'}
                              </span>
                              <span style={{ fontSize: '0.84rem', color: '#334155', fontWeight: 500 }}>
                                {log.device || 'Desktop'} &middot; {log.browser || 'Browser'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <code
                              style={{
                                background: '#f8fafc',
                                padding: '3px 7px',
                                borderRadius: 5,
                                fontSize: '0.8rem',
                                border: '1px solid #e2e8f0',
                                color: '#475569',
                              }}
                            >
                              {log.ip || '127.0.0.1'}
                            </code>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AUDIT LOGS (SIRF AUDITOR KE ACTIVITIES) */}
        {activeTab === 'audits' && (
          <div>
            {/* Filter Bar */}
            <div className="filter-bar">
              <div className="search-input-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search audit logs by ATM ID, Auditor Name, Area / Zone, Action..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                />
                {auditSearch && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => setAuditSearch('')}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem' }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginLeft: 'auto', fontWeight: 600 }}>
                Showing <strong>{filteredAuditLogs.length}</strong> of {auditLogs.length} audit logs
              </span>
            </div>

            {loading && (
              <p style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Loading audit activity logs...
              </p>
            )}

            {!loading && filteredAuditLogs.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '44px 20px',
                  background: '#f8fafc',
                  borderRadius: 12,
                  border: '1px dashed var(--color-border)',
                }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📋</div>
                <h3 style={{ margin: '0 0 6px' }}>No Auditor Audit Logs Found</h3>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  No auditor inspection logs matched your search query.
                </p>
              </div>
            )}

            {!loading && filteredAuditLogs.length > 0 && (
              <div className="table-responsive">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th style={{ width: 45, textAlign: 'center' }}>#</th>
                      <th>Action</th>
                      <th>Auditor</th>
                      <th>ATM ID</th>
                      <th>Area / Zone</th>
                      <th>Inspection Summary</th>
                      <th>Date & Time</th>
                      <th>IP / Origin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditLogs.map((log, idx) => (
                      <tr key={log._id || idx}>
                        <td style={{ textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
                          {idx + 1}
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              background: '#ecfdf5',
                              color: '#047857',
                              border: '1px solid #a7f3d0',
                            }}
                          >
                            <span>✅</span>
                            <span>Audit Submitted</span>
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 8,
                                background: '#f3e8ff',
                                color: '#7c3aed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                              }}
                            >
                              👤
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.88rem' }}>
                                {log.auditorName || 'Auditor'}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                @{log.auditorUsername || 'auditor'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              fontSize: '0.92rem',
                              color: '#0284c7',
                              background: '#f0f9ff',
                              padding: '3px 8px',
                              borderRadius: 6,
                              border: '1px solid #bae6fd',
                            }}
                          >
                            {log.atmId}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.82rem',
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: '#f1f5f9',
                              color: '#334155',
                              fontWeight: 600,
                            }}
                          >
                            📍 {log.area || 'General'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              style={{
                                fontSize: '0.82rem',
                                color: '#047857',
                                background: '#f0fdf4',
                                padding: '2px 7px',
                                borderRadius: 6,
                                border: '1px solid #bbf7d0',
                                fontWeight: 600,
                              }}
                            >
                              📸 {log.photoCount || 0} Photos
                            </span>
                            {log.stageCount > 0 && (
                              <span
                                style={{
                                  fontSize: '0.82rem',
                                  color: '#4338ca',
                                  background: '#eef2ff',
                                  padding: '2px 7px',
                                  borderRadius: 6,
                                  border: '1px solid #c7d2fe',
                                  fontWeight: 600,
                                }}
                              >
                                📋 {log.stageCount} Stages
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.86rem', color: '#1e293b', fontWeight: 500 }}>
                            {formatDateTime(log.createdAt)}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 1 }}>
                            {timeAgo(log.createdAt)}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            <code>{log.ip || '127.0.0.1'}</code>
                          </div>
                          {log.device && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                              {log.device} &middot; {log.browser}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
