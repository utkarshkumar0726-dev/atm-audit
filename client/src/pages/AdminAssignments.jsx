import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AdminNav from '../components/AdminNav';

export default function AdminAssignments() {
  const { user, logout } = useAuth();
  const [auditors, setAuditors] = useState([]);
  const [atms, setAtms] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(''); // '' | 'assigned' | 'unassigned'
  const [selectedAuditorFilter, setSelectedAuditorFilter] = useState('');

  // Multi-select state
  const [selectedAtmIds, setSelectedAtmIds] = useState(new Set());
  const [bulkAuditorId, setBulkAuditorId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  // Branch quick assign panel state
  const [showBranchAssign, setShowBranchAssign] = useState(false);
  const [branchAssignAuditor, setBranchAssignAuditor] = useState('');
  const [branchAssignTarget, setBranchAssignTarget] = useState('');
  const [branchAssigning, setBranchAssigning] = useState(false);

  // Feedback notifications
  const [feedback, setFeedback] = useState(null);

  function showToast(text, type = 'success') {
    setFeedback({ text, type });
    setTimeout(() => {
      setFeedback(null);
    }, 5000);
  }

  function loadData() {
    setLoading(true);
    Promise.all([
      api.get('/auth/auditors'),
      api.get('/atms'),
      api.get('/assignments'),
    ])
      .then(([auditorsRes, atmsRes, assignmentsRes]) => {
        setAuditors(auditorsRes.data || []);
        setAtms(atmsRes.data || []);
        setAssignments(assignmentsRes.data || []);
      })
      .catch((err) => {
        showToast(err.response?.data?.message || 'Failed to load assignment data', 'error');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  // Map from atm._id -> assignment object
  const assignmentMap = useMemo(() => {
    const map = new Map();
    assignments.forEach((asg) => {
      const atmKey = asg.atm?._id || asg.atm?.id || asg.atm;
      if (atmKey) {
        map.set(String(atmKey), asg);
      }
    });
    return map;
  }, [assignments]);

  // Unique branches with counts
  const branchList = useMemo(() => {
    const map = new Map();
    atms.forEach((a) => {
      const name = a.branchName?.trim() || a.location?.trim() || 'Unknown';
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [atms]);

  // Unique zones
  const zoneList = useMemo(() => {
    const set = new Set();
    atms.forEach((a) => {
      const z = a.area?.name || a.zone;
      if (z) set.add(z);
    });
    return Array.from(set).sort();
  }, [atms]);

  // Statistics
  const stats = useMemo(() => {
    const total = atms.length;
    let assigned = 0;
    atms.forEach((a) => {
      if (assignmentMap.has(String(a._id || a.id))) assigned++;
    });
    const unassigned = total - assigned;
    return {
      total,
      assigned,
      unassigned,
      auditorsCount: auditors.length,
    };
  }, [atms, assignmentMap, auditors]);

  // Filtered ATMs
  const filteredAtms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return atms.filter((a) => {
      const atmKey = String(a._id || a.id);
      const asg = assignmentMap.get(atmKey);
      const isAssigned = !!asg;

      // Status filter
      if (selectedStatus === 'assigned' && !isAssigned) return false;
      if (selectedStatus === 'unassigned' && isAssigned) return false;

      // Auditor filter
      if (selectedAuditorFilter) {
        if (!asg || (asg.auditor?._id !== selectedAuditorFilter && asg.auditor?.id !== selectedAuditorFilter)) {
          return false;
        }
      }

      // Branch filter
      if (selectedBranch) {
        const b = a.branchName?.trim() || a.location?.trim() || '';
        if (b.toLowerCase() !== selectedBranch.toLowerCase()) return false;
      }

      // Zone filter
      if (selectedZone) {
        const z = a.area?.name || a.zone || '';
        if (z.toLowerCase() !== selectedZone.toLowerCase()) return false;
      }

      // Vendor filter
      if (selectedVendor && a.vendor !== selectedVendor) return false;

      // Text search
      if (!q) return true;
      return (
        a.atmId?.toLowerCase().includes(q) ||
        a.branchName?.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q) ||
        a.address?.toLowerCase().includes(q) ||
        a.inchargeName?.toLowerCase().includes(q) ||
        a.inchargeContact?.includes(q) ||
        a.bic?.toLowerCase().includes(q) ||
        asg?.auditor?.name?.toLowerCase().includes(q)
      );
    });
  }, [
    atms,
    search,
    selectedBranch,
    selectedZone,
    selectedVendor,
    selectedStatus,
    selectedAuditorFilter,
    assignmentMap,
  ]);

  // Selection handlers
  function toggleSelectAtm(id) {
    setSelectedAtmIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const allFilteredSelected =
    filteredAtms.length > 0 && filteredAtms.every((a) => selectedAtmIds.has(String(a._id || a.id)));

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      // Unselect filtered
      setSelectedAtmIds((prev) => {
        const next = new Set(prev);
        filteredAtms.forEach((a) => next.delete(String(a._id || a.id)));
        return next;
      });
    } else {
      // Select all filtered
      setSelectedAtmIds((prev) => {
        const next = new Set(prev);
        filteredAtms.forEach((a) => next.add(String(a._id || a.id)));
        return next;
      });
    }
  }

  function clearSelection() {
    setSelectedAtmIds(new Set());
  }

  // Bulk Assign
  async function handleBulkAssign() {
    if (!bulkAuditorId) {
      showToast('Please choose an auditor to assign selected ATMs to', 'error');
      return;
    }
    if (selectedAtmIds.size === 0) return;

    setBulkAssigning(true);
    try {
      const res = await api.post('/assignments/bulk', {
        auditorId: bulkAuditorId,
        atmIds: Array.from(selectedAtmIds),
      });
      showToast(res.data.message || `Successfully assigned ${selectedAtmIds.size} ATMs!`);
      setSelectedAtmIds(new Set());
      setBulkAuditorId('');
      loadData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Bulk assignment failed', 'error');
    } finally {
      setBulkAssigning(false);
    }
  }

  // Bulk Unassign
  async function handleBulkUnassign() {
    if (selectedAtmIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to unassign ${selectedAtmIds.size} selected ATM(s)?`)) {
      return;
    }

    setBulkAssigning(true);
    try {
      const res = await api.post('/assignments/bulk-unassign', {
        atmIds: Array.from(selectedAtmIds),
      });
      showToast(res.data.message || `Unassigned ${res.data.count} ATM(s) successfully!`);
      setSelectedAtmIds(new Set());
      loadData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Bulk unassign failed', 'error');
    } finally {
      setBulkAssigning(false);
    }
  }

  // Single Inline Assign / Reassign
  async function handleSingleAssign(atmId, auditorId) {
    if (!auditorId) {
      // Unassign
      const atmKey = String(atmId);
      const asg = assignmentMap.get(atmKey);
      if (asg) {
        try {
          await api.delete(`/assignments/${asg._id || asg.id}`);
          showToast('ATM unassigned successfully');
          loadData();
        } catch (err) {
          showToast(err.response?.data?.message || 'Failed to unassign', 'error');
        }
      }
      return;
    }

    try {
      await api.post('/assignments', {
        auditorId,
        atmId,
        reassign: true,
      });
      showToast('ATM assigned successfully');
      loadData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to assign ATM', 'error');
    }
  }

  // Quick Assign By Branch
  async function handleAssignByBranch(e) {
    e.preventDefault();
    if (!branchAssignTarget || !branchAssignAuditor) {
      showToast('Please select both a Branch and an Auditor', 'error');
      return;
    }

    setBranchAssigning(true);
    try {
      const res = await api.post('/assignments/by-branch', {
        branchName: branchAssignTarget,
        auditorId: branchAssignAuditor,
      });
      showToast(res.data.message || `Assigned branch ATMs successfully!`);
      setBranchAssignTarget('');
      setBranchAssignAuditor('');
      setShowBranchAssign(false);
      loadData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to assign by branch', 'error');
    } finally {
      setBranchAssigning(false);
    }
  }

  // Export CSV of Assignments
  function exportCSV() {
    if (filteredAtms.length === 0) return;
    const headers = [
      'SLNO',
      'ATMID',
      'BRANCH_NAME',
      'ZONE',
      'VENDOR',
      'INCHARGE_NAME',
      'INCHARGE_CONTACT',
      'ASSIGNMENT_STATUS',
      'ASSIGNED_AUDITOR',
      'AUDITOR_USERNAME',
    ];

    const rows = filteredAtms.map((a, i) => {
      const atmKey = String(a._id || a.id);
      const asg = assignmentMap.get(atmKey);
      return [
        a.slNo || i + 1,
        `"${a.atmId || ''}"`,
        `"${(a.branchName || a.location || '').replace(/"/g, '""')}"`,
        `"${a.area?.name || a.zone || ''}"`,
        `"${a.vendor || ''}"`,
        `"${(a.inchargeName || '').replace(/"/g, '""')}"`,
        `"${a.inchargeContact || ''}"`,
        asg ? 'ASSIGNED' : 'UNASSIGNED',
        `"${asg?.auditor?.name || ''}"`,
        `"${asg?.auditor?.username || ''}"`,
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `atm_assignments_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="page">
      <Topbar>
        <span className="user-chip">
          {user?.name} <span className="role-badge">Admin</span>
        </span>
        <button className="link" onClick={logout}>
          Logout
        </button>
      </Topbar>

      <AdminNav />

      <div className="card wide">
        {/* Toast / Feedback Banner */}
        {feedback && (
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 8,
              marginBottom: 20,
              background: feedback.type === 'error' ? '#fee2e2' : '#dcfce7',
              border: `1px solid ${feedback.type === 'error' ? '#f87171' : '#86efac'}`,
              color: feedback.type === 'error' ? '#991b1b' : '#166534',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontWeight: 500,
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <span>{feedback.text}</span>
            <button
              onClick={() => setFeedback(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '1.1rem',
              }}
            >
              &times;
            </button>
          </div>
        )}

        {/* Page Title & Top Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', letterSpacing: '-0.02em' }}>
              ATM Assignments Management
            </h1>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Assign ATMs to auditors individually, in batch via multi-select, or by whole branch name.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowBranchAssign((prev) => !prev)}
              style={{
                background: showBranchAssign ? '#e2e8f0' : '#f8fafc',
                color: '#1e293b',
                border: '1px solid var(--color-border)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                borderRadius: 8,
              }}
            >
              🏢 {showBranchAssign ? 'Close Branch Assign' : 'Assign by Branch'}
            </button>

            <button
              onClick={exportCSV}
              style={{
                background: '#f8fafc',
                color: '#1e293b',
                border: '1px solid var(--color-border)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                borderRadius: 8,
              }}
            >
              📥 Export CSV
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 14,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Total Master ATMs
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--color-text)', marginTop: 4 }}>
              {stats.total}
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.02))',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600, textTransform: 'uppercase' }}>
              Assigned ATMs
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 700, color: '#059669', marginTop: 4 }}>
              {stats.assigned}
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.02))',
              border: '1px solid rgba(239, 68, 68, 0.25)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 600, textTransform: 'uppercase' }}>
              Unassigned ATMs
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 700, color: '#dc2626', marginTop: 4 }}>
              {stats.unassigned}
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(37, 99, 235, 0.02))',
              border: '1px solid rgba(37, 99, 235, 0.25)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#1d4ed8', fontWeight: 600, textTransform: 'uppercase' }}>
              Registered Auditors
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: 4 }}>
              {stats.auditorsCount}
            </div>
          </div>
        </div>

        {/* Quick Assign by Branch Collapsible Panel */}
        {showBranchAssign && (
          <div
            style={{
              padding: 20,
              background: '#f1f5f9',
              borderRadius: 12,
              border: '1px solid #cbd5e1',
              marginBottom: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
                🏢 Bulk Assign by Branch Name
              </h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                Assigns all ATMs belonging to the chosen branch in one click
              </span>
            </div>

            <form
              onSubmit={handleAssignByBranch}
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div style={{ flex: '1 1 260px' }}>
                <select
                  value={branchAssignTarget}
                  onChange={(e) => setBranchAssignTarget(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#fff' }}
                >
                  <option value="">-- Select Branch Name --</option>
                  {branchList.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name} ({b.count} ATM{b.count > 1 ? 's' : ''})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: '1 1 220px' }}>
                <select
                  value={branchAssignAuditor}
                  onChange={(e) => setBranchAssignAuditor(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#fff' }}
                >
                  <option value="">-- Select Auditor --</option>
                  {auditors.map((aud) => (
                    <option key={aud._id || aud.id} value={aud._id || aud.id}>
                      {aud.name} (@{aud.username})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={branchAssigning}
                style={{
                  padding: '10px 20px',
                  fontWeight: 600,
                  borderRadius: 8,
                  whiteSpace: 'nowrap',
                }}
              >
                {branchAssigning ? 'Assigning...' : 'Assign All ATMs in Branch'}
              </button>
            </form>
          </div>
        )}

        {/* Filter Bar */}
        <div
          style={{
            background: '#ffffff',
            padding: '16px',
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            marginBottom: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Top row: search + status */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 300px' }}>
              <input
                type="text"
                placeholder="🔍 Search by ATM ID, Branch Name, Address, Contact, or Auditor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8 }}
              />
            </div>

            <div style={{ flex: '1 1 160px' }}>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8 }}
              >
                <option value="">All Statuses ({stats.total})</option>
                <option value="unassigned">⚠️ Unassigned ({stats.unassigned})</option>
                <option value="assigned">✅ Assigned ({stats.assigned})</option>
              </select>
            </div>

            <div style={{ flex: '1 1 180px' }}>
              <select
                value={selectedAuditorFilter}
                onChange={(e) => setSelectedAuditorFilter(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8 }}
              >
                <option value="">All Auditors ({auditors.length})</option>
                {auditors.map((aud) => (
                  <option key={aud._id || aud.id} value={aud._id || aud.id}>
                    {aud.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bottom row: Branch, Zone, Vendor filters */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.9rem' }}
              >
                <option value="">All Branches ({branchList.length})</option>
                {branchList.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.count})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: '1 1 160px' }}>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.9rem' }}
              >
                <option value="">All Zones ({zoneList.length})</option>
                {zoneList.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: '1 1 140px' }}>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.9rem' }}
              >
                <option value="">All Vendors</option>
                <option value="Provigil">Provigil</option>
                <option value="CMS">CMS</option>
              </select>
            </div>

            {(search || selectedBranch || selectedZone || selectedVendor || selectedStatus || selectedAuditorFilter) && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedBranch('');
                  setSelectedZone('');
                  setSelectedVendor('');
                  setSelectedStatus('');
                  setSelectedAuditorFilter('');
                }}
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid var(--color-border)',
                  padding: '9px 16px',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Floating / Sticky Bulk Action Bar */}
        {selectedAtmIds.size > 0 && (
          <div
            style={{
              padding: '12px 20px',
              background: '#1e293b',
              color: '#ffffff',
              borderRadius: 12,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
              position: 'sticky',
              top: 10,
              zIndex: 100,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#38bdf8' }}>
                🎯 {selectedAtmIds.size} ATM(s) Selected
              </span>
              <button
                onClick={clearSelection}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                Deselect All
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <select
                value={bulkAuditorId}
                onChange={(e) => setBulkAuditorId(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: '#334155',
                  color: '#ffffff',
                  border: '1px solid #475569',
                  fontSize: '0.9rem',
                }}
              >
                <option value="">-- Choose Auditor to Assign --</option>
                {auditors.map((aud) => (
                  <option key={aud._id || aud.id} value={aud._id || aud.id}>
                    {aud.name} (@{aud.username})
                  </option>
                ))}
              </select>

              <button
                onClick={handleBulkAssign}
                disabled={bulkAssigning}
                style={{
                  padding: '8px 18px',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 600,
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {bulkAssigning ? 'Assigning...' : `Assign (${selectedAtmIds.size}) to Auditor`}
              </button>

              <button
                onClick={handleBulkUnassign}
                disabled={bulkAssigning}
                style={{
                  padding: '8px 16px',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 600,
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Unassign Selected
              </button>
            </div>
          </div>
        )}

        {/* Results Count & Bulk Select visible */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            fontSize: '0.9rem',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>
            Showing <strong>{filteredAtms.length}</strong> of {stats.total} ATMs
          </span>

          {filteredAtms.length > 0 && (
            <button
              onClick={toggleSelectAllFiltered}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {allFilteredSelected ? 'Deselect All Visible' : 'Select All Visible (' + filteredAtms.length + ')'}
            </button>
          )}
        </div>

        {/* ATMs Table */}
        {loading && <p style={{ padding: '24px 0', color: 'var(--color-text-muted)' }}>Loading ATM master list...</p>}

        {!loading && filteredAtms.length === 0 && (
          <p className="empty-state" style={{ padding: 40, textAlign: 'center' }}>
            No ATMs match the selected filters. Try changing or clearing your search criteria.
          </p>
        )}

        {!loading && filteredAtms.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      style={{ cursor: 'pointer', width: 16, height: 16 }}
                      title="Select/Deselect all visible ATMs"
                    />
                  </th>
                  <th style={{ width: 70 }}>#SL</th>
                  <th>ATM ID</th>
                  <th>Branch Name</th>
                  <th>Zone</th>
                  <th>Vendor</th>
                  <th>Incharge</th>
                  <th>Assigned Auditor Status</th>
                  <th style={{ minWidth: 200, textAlign: 'right' }}>Quick Assign</th>
                </tr>
              </thead>
              <tbody>
                {filteredAtms.map((atm) => {
                  const atmKey = String(atm._id || atm.id);
                  const asg = assignmentMap.get(atmKey);
                  const isSelected = selectedAtmIds.has(atmKey);
                  const assignedAuditorId = asg?.auditor?._id || asg?.auditor?.id || '';

                  return (
                    <tr
                      key={atmKey}
                      style={{
                        background: isSelected ? 'rgba(37, 99, 235, 0.05)' : undefined,
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectAtm(atmKey)}
                          style={{ cursor: 'pointer', width: 16, height: 16 }}
                        />
                      </td>

                      {/* SL No */}
                      <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        {atm.slNo || '-'}
                      </td>

                      {/* ATM ID */}
                      <td>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            color: 'var(--color-primary)',
                            background: 'rgba(37, 99, 235, 0.08)',
                            padding: '3px 8px',
                            borderRadius: 6,
                          }}
                        >
                          {atm.atmId}
                        </span>
                        {atm.siteType && (
                          <div
                            style={{
                              fontSize: '0.7rem',
                              color: '#64748b',
                              marginTop: 2,
                              fontWeight: 600,
                            }}
                          >
                            {atm.siteType}
                          </div>
                        )}
                      </td>

                      {/* Branch Name */}
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9rem' }}>
                          {atm.branchName || atm.location || '—'}
                        </div>
                        {atm.bic && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            BIC: {atm.bic}
                          </div>
                        )}
                      </td>

                      {/* Zone */}
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            background: '#f1f5f9',
                            color: '#334155',
                          }}
                        >
                          {atm.area?.name || atm.zone || 'General'}
                        </span>
                      </td>

                      {/* Vendor */}
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background:
                              atm.vendor === 'CMS'
                                ? 'rgba(217, 119, 6, 0.12)'
                                : 'rgba(37, 99, 235, 0.12)',
                            color: atm.vendor === 'CMS' ? '#b45309' : '#1d4ed8',
                          }}
                        >
                          {atm.vendor || 'General'}
                        </span>
                      </td>

                      {/* Incharge */}
                      <td>
                        {atm.inchargeName ? (
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#334155' }}>
                              {atm.inchargeName}
                            </div>
                            {atm.inchargeContact && (
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                📞 {atm.inchargeContact}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>—</span>
                        )}
                      </td>

                      {/* Assignment Status */}
                      <td>
                        {asg ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '4px 10px',
                                borderRadius: 8,
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                background: '#dcfce7',
                                color: '#15803d',
                                border: '1px solid #bbf7d0',
                              }}
                            >
                              👤 {asg.auditor?.name}
                            </span>
                            <button
                              onClick={() => handleSingleAssign(atmKey, '')}
                              title="Unassign this auditor"
                              style={{
                                background: '#fee2e2',
                                border: 'none',
                                color: '#dc2626',
                                borderRadius: '50%',
                                width: 22,
                                height: 22,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                              }}
                            >
                              &times;
                            </button>
                          </div>
                        ) : (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              background: '#fef2f2',
                              color: '#b91c1c',
                              border: '1px solid #fecaca',
                            }}
                          >
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Inline Quick Assign dropdown */}
                      <td style={{ textAlign: 'right' }}>
                        <select
                          value={assignedAuditorId}
                          onChange={(e) => handleSingleAssign(atmKey, e.target.value)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            fontSize: '0.85rem',
                            border: '1px solid var(--color-border)',
                            background: asg ? '#f8fafc' : '#ffffff',
                            fontWeight: 500,
                            maxWidth: 180,
                            cursor: 'pointer',
                          }}
                        >
                          <option value="">-- {asg ? 'Unassign' : 'Assign Auditor'} --</option>
                          {auditors.map((aud) => (
                            <option key={aud._id || aud.id} value={aud._id || aud.id}>
                              {aud.name} (@{aud.username})
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
