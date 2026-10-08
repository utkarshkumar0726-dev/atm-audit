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

export function getAuditBadge(action = '') {
  const act = String(action || '').toUpperCase();

  if (act === 'AUDIT_ALL_STAGES_COMPLETED' || act === 'FULL_AUDIT_SUBMITTED') {
    return {
      label: 'All 3 Stages Completed',
      icon: '🎉',
      bg: '#ecfdf5',
      color: '#047857',
      border: '#a7f3d0',
      description: 'Auditor completed all 3 stages for this ATM',
    };
  }

  if (act === 'AUDIT_DELETED') {
    return {
      label: 'Audit Deleted',
      icon: '🗑️',
      bg: '#fef2f2',
      color: '#b91c1c',
      border: '#fecaca',
      description: 'Audit record deleted by administrator',
    };
  }

  if (act.includes('STAGE_2') || act.includes('FUNCTIONAL CHECKS')) {
    return {
      label: 'Stage 2 (Functional) Merged',
      icon: '🔄',
      bg: '#eff6ff',
      color: '#1d4ed8',
      border: '#bfdbfe',
      description: 'Stage 2 checklist & photos merged into audit record',
    };
  }

  if (act.includes('STAGE_3') || act.includes('FINAL CHECKS')) {
    return {
      label: 'Stage 3 (Final) Merged',
      icon: '🔄',
      bg: '#eff6ff',
      color: '#1d4ed8',
      border: '#bfdbfe',
      description: 'Stage 3 checklist merged into audit record',
    };
  }

  if (act.startsWith('AUDIT_STAGE_') && act.endsWith('_UPDATED')) {
    const rawStage = action.replace(/^AUDIT_STAGE_/i, '').replace(/_UPDATED$/i, '').trim();
    return {
      label: `${rawStage || 'Stage'} Merged`,
      icon: '🔄',
      bg: '#eff6ff',
      color: '#1d4ed8',
      border: '#bfdbfe',
      description: 'Audit stage successfully updated & merged',
    };
  }

  if (act === 'AUDIT_INITIAL_STAGE_SUBMITTED' || act === 'STAGE_1_SUBMITTED') {
    return {
      label: 'Initial / Stage 1 Submitted',
      icon: '📦',
      bg: '#fef3c7',
      color: '#b45309',
      border: '#fde68a',
      description: 'Initial audit stage created, pending subsequent stages',
    };
  }

  return {
    label: action ? action.replace(/_/g, ' ') : 'Audit Submitted',
    icon: '📋',
    bg: '#f1f5f9',
    color: '#334155',
    border: '#cbd5e1',
    description: 'Audit activity recorded',
  };
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
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditUserFilter, setAuditUserFilter] = useState('all');

  // Inspector modal state
  const [selectedAuditLog, setSelectedAuditLog] = useState(null);
  const [copiedJson, setCopiedJson] = useState(false);

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

  // Unique users found in Audit Logs
  const uniqueAuditUsers = useMemo(() => {
    const map = new Map();
    auditLogs.forEach((l) => {
      const key = l.auditorUsername || l.auditorName;
      if (key && !map.has(key)) {
        map.set(key, {
          username: l.auditorUsername,
          name: l.auditorName,
        });
      }
    });
    return Array.from(map.values());
  }, [auditLogs]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    let list = auditLogs;

    if (auditActionFilter !== 'all') {
      if (auditActionFilter === 'completed') {
        list = list.filter((l) => l.action?.includes('ALL_STAGES') || l.action?.includes('FULL_AUDIT'));
      } else if (auditActionFilter === 'updated') {
        list = list.filter((l) => l.action?.includes('UPDATED'));
      } else if (auditActionFilter === 'initial') {
        list = list.filter((l) => l.action?.includes('INITIAL') || l.action?.includes('STAGE_1'));
      } else if (auditActionFilter === 'deleted') {
        list = list.filter((l) => l.action?.includes('DELETED'));
      }
    }

    if (auditUserFilter !== 'all') {
      list = list.filter(
        (l) => l.auditorUsername === auditUserFilter || l.auditorName === auditUserFilter
      );
    }

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
  }, [auditLogs, auditActionFilter, auditUserFilter, auditSearch]);

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
            <span>📋 Audit Logs</span>
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

        {/* TAB 2: AUDIT ACTIVITY LOGS */}
        {activeTab === 'audits' && (
          <div>
            {/* Filter Bar */}
            <div className="filter-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="search-input-wrapper" style={{ flex: '1 1 260px', position: 'relative' }}>
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search by ATM ID, Auditor Name, Area / Zone, Action..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  style={{ width: '100%', paddingRight: auditSearch ? 32 : 12 }}
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

              {/* Action Filter */}
              <select
                className="filter-select"
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                style={{ flex: '0 1 210px' }}
              >
                <option value="all">All Audit Actions</option>
                <option value="completed">🎉 All 3 Stages Completed</option>
                <option value="updated">🔄 Stage Updated / Merged</option>
                <option value="initial">📦 Stage 1 / Initial Submitted</option>
                <option value="deleted">🗑️ Audit Deleted</option>
              </select>

              {/* User Filter */}
              <select
                className="filter-select"
                value={auditUserFilter}
                onChange={(e) => setAuditUserFilter(e.target.value)}
                style={{ flex: '0 1 180px' }}
              >
                <option value="all">All Users / Performers</option>
                {uniqueAuditUsers.map((u) => (
                  <option key={u.username || u.name} value={u.username || u.name}>
                    {u.name || u.username}
                  </option>
                ))}
              </select>

              {(auditSearch || auditActionFilter !== 'all' || auditUserFilter !== 'all') && (
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setAuditSearch('');
                    setAuditActionFilter('all');
                    setAuditUserFilter('all');
                  }}
                  style={{ fontSize: '0.84rem', color: '#0284c7', fontWeight: 600, padding: '4px 8px' }}
                >
                  Reset Filters
                </button>
              )}

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
                <h3 style={{ margin: '0 0 6px' }}>No Audit Activity Logs Found</h3>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  No audit logs matched your search or filter selection.
                </p>
              </div>
            )}

            {!loading && filteredAuditLogs.length > 0 && (
              <div className="table-responsive">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th style={{ width: 45, textAlign: 'center' }}>#</th>
                      <th>Action / Event</th>
                      <th>Performed By</th>
                      <th>ATM ID</th>
                      <th>Area / Zone</th>
                      <th>Inspection Progress</th>
                      <th>Date & Time</th>
                      <th>IP & Origin</th>
                      <th style={{ textAlign: 'center', width: 90 }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditLogs.map((log, idx) => {
                      const badge = getAuditBadge(log.action);
                      const isUserAdmin =
                        (log.auditorName || '').toLowerCase().includes('admin') ||
                        (log.auditorUsername || '').toLowerCase() === 'admin';

                      return (
                        <tr key={log._id || idx}>
                          <td style={{ textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
                            {idx + 1}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <span
                                title={badge.description}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  background: badge.bg,
                                  color: badge.color,
                                  border: `1px solid ${badge.border}`,
                                  width: 'fit-content',
                                }}
                              >
                                <span>{badge.icon}</span>
                                <span>{badge.label}</span>
                              </span>
                              {badge.description && (
                                <span style={{ fontSize: '0.72rem', color: '#64748b', paddingLeft: 4 }}>
                                  {badge.description}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  background: isUserAdmin ? '#fef3c7' : '#e0f2fe',
                                  color: isUserAdmin ? '#b45309' : '#0369a1',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.85rem',
                                  border: `1px solid ${isUserAdmin ? '#fde68a' : '#bae6fd'}`,
                                }}
                              >
                                {isUserAdmin ? '👑' : '👤'}
                              </div>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.88rem' }}>
                                    {log.auditorName || (isUserAdmin ? 'Administrator' : 'Auditor')}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: '0.68rem',
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                      fontWeight: 700,
                                      textTransform: 'uppercase',
                                      background: isUserAdmin ? '#fef3c7' : '#eff6ff',
                                      color: isUserAdmin ? '#92400e' : '#1d4ed8',
                                    }}
                                  >
                                    {isUserAdmin ? 'Admin' : 'Auditor'}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                  @{log.auditorUsername || 'user'}
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
                            {log.action === 'AUDIT_DELETED' ? (
                              <span
                                style={{
                                  fontSize: '0.8rem',
                                  color: '#b91c1c',
                                  background: '#fef2f2',
                                  padding: '3px 9px',
                                  borderRadius: 6,
                                  border: '1px solid #fecaca',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span>⚠️</span>
                                <span>Record Deleted</span>
                              </span>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    fontSize: '0.8rem',
                                    color: (log.stageCount || 0) >= 3 ? '#047857' : '#4338ca',
                                    background: (log.stageCount || 0) >= 3 ? '#ecfdf5' : '#eef2ff',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    border: `1px solid ${(log.stageCount || 0) >= 3 ? '#a7f3d0' : '#c7d2fe'}`,
                                    fontWeight: 600,
                                  }}
                                >
                                  {(log.stageCount || 0) >= 3
                                    ? '✅ 3/3 Stages (Complete)'
                                    : `📋 Stage ${log.stageCount || 1} of 3`}
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.8rem',
                                    color: '#0f766e',
                                    background: '#f0fdfa',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    border: '1px solid #ccfbf1',
                                    fontWeight: 600,
                                  }}
                                >
                                  📸 {log.photoCount || 0} Photos
                                </span>
                              </div>
                            )}
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
                              <code
                                style={{
                                  background: '#f8fafc',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  border: '1px solid #e2e8f0',
                                }}
                              >
                                {log.ip || '127.0.0.1'}
                              </code>
                            </div>
                            {log.device && (
                              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>
                                {log.device} &middot; {log.browser}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedAuditLog(log)}
                              style={{
                                background: 'white',
                                border: '1px solid #cbd5e1',
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                color: '#0284c7',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                transition: 'all 0.15s ease',
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.borderColor = '#0284c7';
                                e.currentTarget.style.background = '#f0f9ff';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                e.currentTarget.style.background = 'white';
                              }}
                            >
                              👁️ View
                            </button>
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

        {/* AUDIT LOG INSPECTOR MODAL */}
        {selectedAuditLog && (
          <div className="modal-backdrop" onClick={() => setSelectedAuditLog(null)}>
            <div
              className="modal"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 680, padding: 26 }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 18,
                  paddingBottom: 14,
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>📋</span> Audit Activity Details
                  </h2>
                  <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                    Full audit action payload & system metadata recorded in MongoDB.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAuditLog(null)}
                  style={{
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: 999,
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    color: '#64748b',
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Event Status Banner */}
              {(() => {
                const badge = getAuditBadge(selectedAuditLog.action);
                return (
                  <div
                    style={{
                      background: badge.bg,
                      border: `1px solid ${badge.border}`,
                      borderRadius: 10,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.4rem' }}>{badge.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, color: badge.color, fontSize: '0.96rem' }}>
                          {badge.label}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                          {badge.description || selectedAuditLog.action}
                        </div>
                      </div>
                    </div>
                    <code
                      style={{
                        background: 'rgba(255, 255, 255, 0.7)',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {selectedAuditLog.action}
                    </code>
                  </div>
                );
              })()}

              {/* Key Attributes Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Target ATM ID
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0284c7', fontFamily: 'monospace', marginTop: 3 }}>
                    {selectedAuditLog.atmId}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Area / Zone
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#1e293b', marginTop: 3 }}>
                    📍 {selectedAuditLog.area || 'General / Unspecified'}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Performed By
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#1e293b', marginTop: 3 }}>
                    {selectedAuditLog.auditorName}{' '}
                    <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                      (@{selectedAuditLog.auditorUsername})
                    </span>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Inspection Content
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#1e293b', marginTop: 3 }}>
                    📋 {selectedAuditLog.stageCount || 0} Stages &middot; 📸 {selectedAuditLog.photoCount || 0} Photos
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Timestamp
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b', marginTop: 3 }}>
                    {formatDateTime(selectedAuditLog.createdAt)}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 1 }}>
                    {new Date(selectedAuditLog.createdAt).toISOString()}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Network & Client
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b', marginTop: 3 }}>
                    IP: <code>{selectedAuditLog.ip || '127.0.0.1'}</code>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 1 }}>
                    {selectedAuditLog.device} &middot; {selectedAuditLog.browser}
                  </div>
                </div>
              </div>

              {/* Raw JSON Details Accordion */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Raw Event JSON Record
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(JSON.stringify(selectedAuditLog, null, 2));
                      setCopiedJson(true);
                      setTimeout(() => setCopiedJson(false), 2000);
                    }}
                    style={{
                      background: copiedJson ? '#ecfdf5' : 'white',
                      color: copiedJson ? '#047857' : '#0284c7',
                      border: `1px solid ${copiedJson ? '#a7f3d0' : '#cbd5e1'}`,
                      borderRadius: 6,
                      padding: '3px 9px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {copiedJson ? '✅ Copied to Clipboard' : '📋 Copy JSON'}
                  </button>
                </div>
                <pre
                  style={{
                    background: '#0f172a',
                    color: '#e2e8f0',
                    padding: 14,
                    borderRadius: 8,
                    fontSize: '0.76rem',
                    overflowX: 'auto',
                    maxHeight: 180,
                    margin: 0,
                    fontFamily: 'monospace',
                  }}
                >
                  {JSON.stringify(selectedAuditLog, null, 2)}
                </pre>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: 20,
                  paddingTop: 14,
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSelectedAuditLog(null)}
                  style={{ padding: '8px 20px', borderRadius: 8, fontWeight: 600 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
