import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AdminNav from '../components/AdminNav';
import { downloadAuditsSummaryCSV, downloadSingleAuditCSV, printAuditReport } from '../utils/auditExport';

function getStageStats(stage) {
  if (!stage || !Array.isArray(stage.questions)) return { answered: 0, total: 0, isComplete: false };
  const total = stage.questions.length;
  const answered = stage.questions.filter((q) => q.answer === 'yes' || q.answer === 'no').length;
  const isComplete =
    total > 0 &&
    stage.questions.every((q) => {
      if (q.answer === 'yes') return true;
      if (q.answer === 'no') return Boolean(q.reason?.trim());
      return false;
    });
  return { answered, total, isComplete };
}

function findStageByNumber(audit, stageNum) {
  if (!audit || !Array.isArray(audit.stages)) return null;
  return audit.stages.find((s, idx) => {
    const combined = `${s.stageName || ''} ${s.stageId || ''}`.toLowerCase();
    if (stageNum === 1) return idx === 0 || combined.includes('hardware') || combined.includes('stage 1');
    if (stageNum === 2) return idx === 1 || combined.includes('functional') || combined.includes('stage 2');
    if (stageNum === 3) return idx === 2 || combined.includes('network') || combined.includes('security') || combined.includes('stage 3');
    return false;
  });
}

function hasStageActivity(audit, stageNum) {
  const stage = findStageByNumber(audit, stageNum);
  if (!stage) return false;
  const stats = getStageStats(stage);
  const hasPhotos = (stage.questions || []).some((q) => q.photos && q.photos.length > 0);
  return stats.answered > 0 || hasPhotos;
}

function isAuditComplete(audit) {
  if (audit.isCompleted) return true;
  if (!audit || !Array.isArray(audit.stages) || audit.stages.length < 3) return false;
  return audit.stages.every((st) => {
    const stats = getStageStats(st);
    return stats.total > 0 && stats.isComplete;
  });
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // 4 Submodules: 'all' | 'stage1' | 'stage2' | 'stage3' | 'completed'
  const [activeSubmodule, setActiveSubmodule] = useState('all');

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

  // Filtered by Search
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

  // Counts for each Submodule
  const submoduleCounts = useMemo(() => {
    const stage1 = audits.filter((a) => hasStageActivity(a, 1)).length;
    const stage2 = audits.filter((a) => hasStageActivity(a, 2)).length;
    const stage3 = audits.filter((a) => hasStageActivity(a, 3)).length;
    const completed = audits.filter((a) => isAuditComplete(a)).length;
    return {
      all: audits.length,
      stage1,
      stage2,
      stage3,
      completed,
    };
  }, [audits]);

  // Filtered by Active Submodule
  const displayedAudits = useMemo(() => {
    let list = filteredAudits;
    if (activeSubmodule === 'stage1') {
      list = list.filter((a) => hasStageActivity(a, 1));
    } else if (activeSubmodule === 'stage2') {
      list = list.filter((a) => hasStageActivity(a, 2));
    } else if (activeSubmodule === 'stage3') {
      list = list.filter((a) => hasStageActivity(a, 3));
    } else if (activeSubmodule === 'completed') {
      list = list.filter((a) => isAuditComplete(a));
    }
    return list;
  }, [filteredAudits, activeSubmodule]);

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
            <h1 style={{ margin: 0 }}>Audit Management & Stages</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Track audits across Stage 1, Stage 2, Stage 3, and 100% Complete Audits.
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

        {/* 4 SUBMODULES KPI SUMMARY CARDS */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div
            className="kpi-card"
            onClick={() => setActiveSubmodule('stage1')}
            style={{
              cursor: 'pointer',
              border: activeSubmodule === 'stage1' ? '2px solid #2563eb' : '1px solid var(--color-border)',
              background: activeSubmodule === 'stage1' ? '#eff6ff' : 'white',
            }}
          >
            <div className="kpi-header">
              <span className="kpi-label">Stage 1: Hardware</span>
              <span className="kpi-icon">📦</span>
            </div>
            <div className="kpi-value">{submoduleCounts.stage1}</div>
            <div className="kpi-subtext">ATMs with Stage 1 data</div>
          </div>

          <div
            className="kpi-card"
            onClick={() => setActiveSubmodule('stage2')}
            style={{
              cursor: 'pointer',
              border: activeSubmodule === 'stage2' ? '2px solid #0891b2' : '1px solid var(--color-border)',
              background: activeSubmodule === 'stage2' ? '#ecfeff' : 'white',
            }}
          >
            <div className="kpi-header">
              <span className="kpi-label">Stage 2: Functional</span>
              <span className="kpi-icon">🔄</span>
            </div>
            <div className="kpi-value">{submoduleCounts.stage2}</div>
            <div className="kpi-subtext">ATMs with Stage 2 data</div>
          </div>

          <div
            className="kpi-card"
            onClick={() => setActiveSubmodule('stage3')}
            style={{
              cursor: 'pointer',
              border: activeSubmodule === 'stage3' ? '2px solid #7c3aed' : '1px solid var(--color-border)',
              background: activeSubmodule === 'stage3' ? '#f5f3ff' : 'white',
            }}
          >
            <div className="kpi-header">
              <span className="kpi-label">Stage 3: Network</span>
              <span className="kpi-icon">⚡</span>
            </div>
            <div className="kpi-value">{submoduleCounts.stage3}</div>
            <div className="kpi-subtext">ATMs with Stage 3 data</div>
          </div>

          <div
            className="kpi-card"
            onClick={() => setActiveSubmodule('completed')}
            style={{
              cursor: 'pointer',
              border: activeSubmodule === 'completed' ? '2px solid #059669' : '1px solid var(--color-border)',
              background: activeSubmodule === 'completed' ? '#ecfdf5' : 'white',
            }}
          >
            <div className="kpi-header">
              <span className="kpi-label">Complete Audit</span>
              <span className="kpi-icon">🎉</span>
            </div>
            <div className="kpi-value" style={{ color: '#059669' }}>{submoduleCounts.completed}</div>
            <div className="kpi-subtext">All 3 stages 100% complete</div>
          </div>
        </div>

        {/* 4 SUBMODULE TABS HEADER */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            borderBottom: '2px solid #e2e8f0',
            marginBottom: 20,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveSubmodule('all')}
            style={{
              padding: '10px 18px',
              fontSize: '0.92rem',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              borderBottom: activeSubmodule === 'all' ? '3px solid #0284c7' : '3px solid transparent',
              color: activeSubmodule === 'all' ? '#0284c7' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <span>📊 All Audits</span>
            <span
              style={{
                fontSize: '0.74rem',
                padding: '2px 8px',
                borderRadius: 999,
                background: activeSubmodule === 'all' ? '#e0f2fe' : '#f1f5f9',
                color: activeSubmodule === 'all' ? '#0369a1' : '#64748b',
              }}
            >
              {submoduleCounts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubmodule('stage1')}
            style={{
              padding: '10px 18px',
              fontSize: '0.92rem',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              borderBottom: activeSubmodule === 'stage1' ? '3px solid #2563eb' : '3px solid transparent',
              color: activeSubmodule === 'stage1' ? '#2563eb' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <span>📦 Stage 1: Hardware</span>
            <span
              style={{
                fontSize: '0.74rem',
                padding: '2px 8px',
                borderRadius: 999,
                background: activeSubmodule === 'stage1' ? '#dbeafe' : '#f1f5f9',
                color: activeSubmodule === 'stage1' ? '#1d4ed8' : '#64748b',
              }}
            >
              {submoduleCounts.stage1}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubmodule('stage2')}
            style={{
              padding: '10px 18px',
              fontSize: '0.92rem',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              borderBottom: activeSubmodule === 'stage2' ? '3px solid #0891b2' : '3px solid transparent',
              color: activeSubmodule === 'stage2' ? '#0891b2' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <span>🔄 Stage 2: Functional</span>
            <span
              style={{
                fontSize: '0.74rem',
                padding: '2px 8px',
                borderRadius: 999,
                background: activeSubmodule === 'stage2' ? '#cffafe' : '#f1f5f9',
                color: activeSubmodule === 'stage2' ? '#0e7490' : '#64748b',
              }}
            >
              {submoduleCounts.stage2}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubmodule('stage3')}
            style={{
              padding: '10px 18px',
              fontSize: '0.92rem',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              borderBottom: activeSubmodule === 'stage3' ? '3px solid #7c3aed' : '3px solid transparent',
              color: activeSubmodule === 'stage3' ? '#7c3aed' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <span>⚡ Stage 3: Network & Security</span>
            <span
              style={{
                fontSize: '0.74rem',
                padding: '2px 8px',
                borderRadius: 999,
                background: activeSubmodule === 'stage3' ? '#ede9fe' : '#f1f5f9',
                color: activeSubmodule === 'stage3' ? '#6d28d9' : '#64748b',
              }}
            >
              {submoduleCounts.stage3}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubmodule('completed')}
            style={{
              padding: '10px 18px',
              fontSize: '0.92rem',
              fontWeight: 700,
              background: 'transparent',
              border: 'none',
              borderBottom: activeSubmodule === 'completed' ? '3px solid #059669' : '3px solid transparent',
              color: activeSubmodule === 'completed' ? '#059669' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
            }}
          >
            <span>🎉 Complete Audit (All 3 Stages)</span>
            <span
              style={{
                fontSize: '0.74rem',
                padding: '2px 8px',
                borderRadius: 999,
                background: activeSubmodule === 'completed' ? '#dcfce7' : '#f1f5f9',
                color: activeSubmodule === 'completed' ? '#15803d' : '#64748b',
              }}
            >
              {submoduleCounts.completed}
            </span>
          </button>
        </div>

        {/* Search Input Bar & Export Button */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Search audits by ATM ID, area, or auditor name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              fontSize: '0.9rem',
            }}
          />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => downloadAuditsSummaryCSV(displayedAudits, `Audits_${activeSubmodule}`)}
              disabled={displayedAudits.length === 0}
              title="Download visible audits summary as CSV spreadsheet"
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                background: '#f0fdf4',
                color: '#15803d',
                border: '1px solid #bbf7d0',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: displayedAudits.length === 0 ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              📥 Export {activeSubmodule === 'all' ? 'All' : activeSubmodule === 'completed' ? 'Complete' : activeSubmodule} CSV
            </button>
            <span style={{ fontSize: '0.86rem', color: '#64748b', fontWeight: 600 }}>
              Showing <strong>{displayedAudits.length}</strong> audits
            </span>
          </div>
        </div>

        {loading && <p>Loading audits...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && audits.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📋</div>
            <h3 style={{ margin: '0 0 6px' }}>No Audits Saved Yet</h3>
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              When auditors save Stage 1, Stage 2, Stage 3, or Complete Audits, they will appear in their respective submodules here.
            </p>
          </div>
        )}

        {!loading && audits.length > 0 && displayedAudits.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔍</div>
            <h3 style={{ margin: '0 0 6px' }}>No Audits Found in this Submodule</h3>
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              No audits matched "{search}" under {activeSubmodule === 'completed' ? 'Complete Audit' : activeSubmodule}.
            </p>
          </div>
        )}

        {displayedAudits.length > 0 && (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>ATM ID</th>
                  <th>Area / Zone</th>
                  <th>Auditor</th>
                  <th style={{ background: activeSubmodule === 'stage1' ? 'rgba(37, 99, 235, 0.08)' : 'transparent' }}>
                    📦 Stage 1 (Hardware)
                  </th>
                  <th style={{ background: activeSubmodule === 'stage2' ? 'rgba(8, 145, 178, 0.08)' : 'transparent' }}>
                    🔄 Stage 2 (Functional)
                  </th>
                  <th style={{ background: activeSubmodule === 'stage3' ? 'rgba(124, 58, 237, 0.08)' : 'transparent' }}>
                    ⚡ Stage 3 (Security)
                  </th>
                  <th>Audit Status</th>
                  <th>Last Updated</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedAudits.map((audit) => {
                  const s1 = findStageByNumber(audit, 1);
                  const s2 = findStageByNumber(audit, 2);
                  const s3 = findStageByNumber(audit, 3);
                  const s1Stats = getStageStats(s1);
                  const s2Stats = getStageStats(s2);
                  const s3Stats = getStageStats(s3);
                  const isDone = isAuditComplete(audit);

                  return (
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
                        <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', fontSize: '0.85rem', color: '#334155', fontWeight: 500 }}>
                          📍 {audit.area || 'General'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>
                            {audit.auditor?.name || 'Unknown'}
                          </span>
                          {audit.auditor?.username && (
                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>@{audit.auditor.username}</span>
                          )}
                        </div>
                      </td>

                      {/* Stage 1 */}
                      <td style={{ background: activeSubmodule === 'stage1' ? 'rgba(37, 99, 235, 0.04)' : 'transparent' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            background: s1Stats.isComplete ? '#dcfce7' : s1Stats.answered > 0 ? '#eff6ff' : '#f1f5f9',
                            color: s1Stats.isComplete ? '#15803d' : s1Stats.answered > 0 ? '#1d4ed8' : '#64748b',
                            border: `1px solid ${s1Stats.isComplete ? '#bbf7d0' : s1Stats.answered > 0 ? '#bfdbfe' : '#e2e8f0'}`,
                          }}
                        >
                          {s1Stats.isComplete ? '✅' : '⏳'} {s1Stats.answered}/{s1Stats.total || 10}
                        </span>
                      </td>

                      {/* Stage 2 */}
                      <td style={{ background: activeSubmodule === 'stage2' ? 'rgba(8, 145, 178, 0.04)' : 'transparent' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            background: s2Stats.isComplete ? '#dcfce7' : s2Stats.answered > 0 ? '#cffafe' : '#f1f5f9',
                            color: s2Stats.isComplete ? '#15803d' : s2Stats.answered > 0 ? '#0e7490' : '#64748b',
                            border: `1px solid ${s2Stats.isComplete ? '#bbf7d0' : s2Stats.answered > 0 ? '#a5f3fc' : '#e2e8f0'}`,
                          }}
                        >
                          {s2Stats.isComplete ? '✅' : '⏳'} {s2Stats.answered}/{s2Stats.total || 15}
                        </span>
                      </td>

                      {/* Stage 3 */}
                      <td style={{ background: activeSubmodule === 'stage3' ? 'rgba(124, 58, 237, 0.04)' : 'transparent' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            background: s3Stats.isComplete ? '#dcfce7' : s3Stats.answered > 0 ? '#ede9fe' : '#f1f5f9',
                            color: s3Stats.isComplete ? '#15803d' : s3Stats.answered > 0 ? '#6d28d9' : '#64748b',
                            border: `1px solid ${s3Stats.isComplete ? '#bbf7d0' : s3Stats.answered > 0 ? '#ddd6fe' : '#e2e8f0'}`,
                          }}
                        >
                          {s3Stats.isComplete ? '✅' : '⏳'} {s3Stats.answered}/{s3Stats.total || 12}
                        </span>
                      </td>

                      {/* Overall Status */}
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 10px',
                            borderRadius: 20,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            background: isDone ? '#dcfce7' : '#fef3c7',
                            color: isDone ? '#15803d' : '#b45309',
                            border: `1px solid ${isDone ? '#bbf7d0' : '#fde68a'}`,
                          }}
                        >
                          {isDone ? '🎉 Complete Audit' : `⏳ In Progress (${s1Stats.answered + s2Stats.answered + s3Stats.answered}/37)`}
                        </span>
                      </td>

                      <td style={{ color: '#475569', fontSize: '0.86rem' }}>
                        {new Date(audit.updatedAt || audit.createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>

                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => printAuditReport(audit)}
                            title="Download or Print PDF Inspection Report"
                            style={{
                              padding: '6px 10px',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              borderRadius: 6,
                              background: '#1e3a8a',
                              color: '#ffffff',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            📄 PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadSingleAuditCSV(audit)}
                            title="Download Checklist as CSV"
                            style={{
                              padding: '6px 10px',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              borderRadius: 6,
                              background: '#f0fdf4',
                              color: '#15803d',
                              border: '1px solid #bbf7d0',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            📊 CSV
                          </button>
                          <Link
                            to={`/admin/audits/${audit._id}`}
                            style={{
                              padding: '6px 10px',
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
                          <Link
                            to={`/audit/new?atmId=${audit.atmId}`}
                            style={{
                              padding: '6px 12px',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              borderRadius: 6,
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title="Edit or update this audit"
                          >
                            ✏️ Edit
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
                  );
                })}
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
