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

  // Filters & Search in table
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(''); // '' | 'assigned' | 'unassigned'
  const [selectedAuditorFilter, setSelectedAuditorFilter] = useState('');

  // Multi-select state in table
  const [selectedAtmIds, setSelectedAtmIds] = useState(new Set());
  const [bulkAuditorId, setBulkAuditorId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  // Modal Form State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [modalMode, setModalMode] = useState('atms'); // 'atms' | 'branch' | 'zone'
  const [modalSelectedAtmIds, setModalSelectedAtmIds] = useState(new Set());
  const [modalAuditorId, setModalAuditorId] = useState('');
  const [modalBranch, setModalBranch] = useState('');
  const [modalZone, setModalZone] = useState('');
  const [modalAtmSearch, setModalAtmSearch] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

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

  // Unique zones with counts
  const zoneList = useMemo(() => {
    const map = new Map();
    atms.forEach((a) => {
      const z = a.area?.name || a.zone || 'General';
      map.set(z, (map.get(z) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
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

  // Filtered ATMs for the table
  const filteredAtms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return atms.filter((a) => {
      const atmKey = String(a._id || a.id);
      const asg = assignmentMap.get(atmKey);
      const isAssigned = !!asg;

      if (selectedStatus === 'assigned' && !isAssigned) return false;
      if (selectedStatus === 'unassigned' && isAssigned) return false;

      if (selectedAuditorFilter) {
        if (!asg || (asg.auditor?._id !== selectedAuditorFilter && asg.auditor?.id !== selectedAuditorFilter)) {
          return false;
        }
      }

      if (selectedBranch) {
        const b = a.branchName?.trim() || a.location?.trim() || '';
        if (b.toLowerCase() !== selectedBranch.toLowerCase()) return false;
      }

      if (selectedZone) {
        const z = a.area?.name || a.zone || '';
        if (z.toLowerCase() !== selectedZone.toLowerCase()) return false;
      }

      if (selectedVendor && a.vendor !== selectedVendor) return false;

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

  // Filtered ATMs inside the Modal
  const modalFilteredAtms = useMemo(() => {
    const q = modalAtmSearch.trim().toLowerCase();
    if (!q) return atms;
    return atms.filter(
      (a) =>
        a.atmId?.toLowerCase().includes(q) ||
        a.branchName?.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q) ||
        (a.area?.name || a.zone || '').toLowerCase().includes(q)
    );
  }, [atms, modalAtmSearch]);

  // Table selection handlers
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
      setSelectedAtmIds((prev) => {
        const next = new Set(prev);
        filteredAtms.forEach((a) => next.delete(String(a._id || a.id)));
        return next;
      });
    } else {
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

  // Open the Assign Modal
  function openAssignModal(prefill = {}) {
    setModalError('');
    if (prefill.atmId) {
      setModalMode('atms');
      setModalSelectedAtmIds(new Set([String(prefill.atmId)]));
      setModalAuditorId(prefill.currentAuditorId || '');
    } else if (selectedAtmIds.size > 0) {
      setModalMode('atms');
      setModalSelectedAtmIds(new Set(selectedAtmIds));
      setModalAuditorId(bulkAuditorId || '');
    } else {
      setModalMode('atms');
      setModalSelectedAtmIds(new Set());
      setModalAuditorId('');
    }
    setModalBranch(prefill.branch || '');
    setModalZone(prefill.zone || '');
    setModalAtmSearch('');
    setShowAssignModal(true);
  }

  function closeAssignModal() {
    setShowAssignModal(false);
    setModalError('');
  }

  function toggleModalAtm(id) {
    setModalSelectedAtmIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Submit the Assign Modal Form
  async function handleModalSubmit(e) {
    e.preventDefault();
    setModalError('');

    if (!modalAuditorId) {
      setModalError('Please select an Auditor');
      return;
    }

    setModalSubmitting(true);
    try {
      if (modalMode === 'atms') {
        if (modalSelectedAtmIds.size === 0) {
          setModalError('Please select at least one ATM to assign');
          setModalSubmitting(false);
          return;
        }

        const res = await api.post('/assignments/bulk', {
          auditorId: modalAuditorId,
          atmIds: Array.from(modalSelectedAtmIds),
        });
        showToast(res.data.message || `Assigned ${modalSelectedAtmIds.size} ATM(s) successfully!`);
      } else if (modalMode === 'branch') {
        if (!modalBranch) {
          setModalError('Please select a branch name');
          setModalSubmitting(false);
          return;
        }

        const res = await api.post('/assignments/by-branch', {
          branchName: modalBranch,
          auditorId: modalAuditorId,
        });
        showToast(res.data.message || `Assigned branch ATMs successfully!`);
      } else if (modalMode === 'zone') {
        if (!modalZone) {
          setModalError('Please select a zone');
          setModalSubmitting(false);
          return;
        }

        const res = await api.post('/assignments/by-branch', {
          zoneName: modalZone,
          auditorId: modalAuditorId,
        });
        showToast(res.data.message || `Assigned zone ATMs successfully!`);
      }

      setShowAssignModal(false);
      setSelectedAtmIds(new Set());
      loadData();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Assignment failed');
    } finally {
      setModalSubmitting(false);
    }
  }

  // Bulk Unassign from selection
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

  // Single unassign
  async function handleSingleUnassign(atmId) {
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
          <span className="user-chip-name">{user?.name}</span> <span className="role-badge">Admin</span>
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
              Assign ATMs to auditors using the assignment form, multi-select checkboxes, or by branch/zone.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* Main Action Button requested by user */}
            <button
              onClick={() => openAssignModal()}
              style={{
                background: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 8,
                fontSize: '0.95rem',
                cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
              }}
            >
              ➕ Assign ATM(s) Form
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
                padding: '10px 16px',
                borderRadius: 8,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              📥 Export CSV
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="kpi-grid">
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
                  <option key={z.name} value={z.name}>
                    {z.name} ({z.count})
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
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.25)',
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
              <button
                onClick={() => openAssignModal()}
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
                ➕ Open Assign Form for ({selectedAtmIds.size}) ATMs
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
          <div className="table-responsive">
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
                  <th style={{ width: 60 }}>#SL</th>
                  <th>ATM ID</th>
                  <th>Branch Name</th>
                  <th>Zone</th>
                  <th>Vendor</th>
                  <th>Incharge</th>
                  <th>Assignment Status</th>
                  <th style={{ minWidth: 160, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAtms.map((atm, idx) => {
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
                        {!selectedVendor ? idx + 1 : (atm.slNo || idx + 1)}
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
                        {atm.address && (
                          <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 3, maxWidth: 280, wordBreak: 'break-word', lineHeight: 1.35 }}>
                            📍 {atm.address} {atm.pincode ? `(${atm.pincode})` : ''}
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
                              onClick={() => handleSingleUnassign(atmKey)}
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

                      {/* Action buttons (Assign / Reassign form trigger) */}
                      <td style={{ textAlign: 'right' }}>
                        {asg ? (
                          <button
                            onClick={() => openAssignModal({ atmId: atmKey, currentAuditorId: assignedAuditorId })}
                            style={{
                              padding: '6px 12px',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              borderRadius: 6,
                              background: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid var(--color-border)',
                              cursor: 'pointer',
                            }}
                          >
                            ✏️ Reassign
                          </button>
                        ) : (
                          <button
                            onClick={() => openAssignModal({ atmId: atmKey })}
                            style={{
                              padding: '6px 14px',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              borderRadius: 6,
                              background: '#2563eb',
                              color: '#ffffff',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            ➕ Assign
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/*              ASSIGNMENT MODAL POPUP FORM                  */}
      {/* ========================================================= */}
      {showAssignModal && (
        <div
          className="modal-backdrop"
          onClick={closeAssignModal}
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
              maxWidth: 680,
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              margin: 'auto',
            }}
          >
            {/* Modal Header */}
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
                  Assign ATM(s) to Auditor
                </h2>
                <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  Assign individual ATMs, multiple selected ATMs, or bulk assign by branch / zone.
                </p>
              </div>

              <button
                onClick={closeAssignModal}
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
                &times;
              </button>
            </div>

            {modalError && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  marginBottom: 16,
                  background: '#fee2e2',
                  border: '1px solid #f87171',
                  color: '#991b1b',
                  fontSize: '0.9rem',
                }}
              >
                {modalError}
              </div>
            )}

            <form onSubmit={handleModalSubmit}>
              {/* Mode Selection Tabs */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                  Choose Assignment Method:
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setModalMode('atms')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: modalMode === 'atms' ? 'var(--color-primary)' : 'var(--color-border)',
                      background: modalMode === 'atms' ? 'rgba(37, 99, 235, 0.1)' : '#f8fafc',
                      color: modalMode === 'atms' ? 'var(--color-primary)' : '#475569',
                      fontWeight: modalMode === 'atms' ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    🎯 Specific ATM(s) ({modalSelectedAtmIds.size})
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalMode('branch')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: modalMode === 'branch' ? 'var(--color-primary)' : 'var(--color-border)',
                      background: modalMode === 'branch' ? 'rgba(37, 99, 235, 0.1)' : '#f8fafc',
                      color: modalMode === 'branch' ? 'var(--color-primary)' : '#475569',
                      fontWeight: modalMode === 'branch' ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    🏢 By Branch Name
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalMode('zone')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: modalMode === 'zone' ? 'var(--color-primary)' : 'var(--color-border)',
                      background: modalMode === 'zone' ? 'rgba(37, 99, 235, 0.1)' : '#f8fafc',
                      color: modalMode === 'zone' ? 'var(--color-primary)' : '#475569',
                      fontWeight: modalMode === 'zone' ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    🗺️ By Zone / Area
                  </button>
                </div>
              </div>

              {/* Mode 1: Select ATMs list */}
              {modalMode === 'atms' && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                      Select ATMs to Assign ({modalSelectedAtmIds.size} selected):
                    </label>
                    {modalSelectedAtmIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setModalSelectedAtmIds(new Set())}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    placeholder="Search ATMs by ID, Branch, or Zone..."
                    value={modalAtmSearch}
                    onChange={(e) => setModalAtmSearch(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 10, fontSize: '0.9rem' }}
                  />

                  {/* Scrollable list of checkboxes */}
                  <div
                    style={{
                      maxHeight: 220,
                      overflowY: 'auto',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      background: '#f8fafc',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    {modalFilteredAtms.length === 0 && (
                      <p style={{ padding: 12, textAlign: 'center', color: 'var(--color-text-muted)', margin: 0 }}>
                        No ATMs found matching search.
                      </p>
                    )}
                    {modalFilteredAtms.map((atm) => {
                      const id = String(atm._id || atm.id);
                      const isChecked = modalSelectedAtmIds.has(id);
                      const asg = assignmentMap.get(id);

                      return (
                        <div
                          key={id}
                          onClick={() => toggleModalAtm(id)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 6,
                            background: isChecked ? '#eff6ff' : '#ffffff',
                            border: `1px solid ${isChecked ? '#bfdbfe' : '#e2e8f0'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by parent onClick
                              style={{ cursor: 'pointer' }}
                            />
                            <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.9rem', color: '#1e293b' }}>
                              {atm.atmId}
                            </span>
                            <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                              {atm.branchName || atm.location || '—'}
                            </span>
                            <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b' }}>
                              {atm.area?.name || atm.zone}
                            </span>
                          </div>

                          <div>
                            {asg ? (
                              <span style={{ fontSize: '0.75rem', color: '#059669', background: '#dcfce7', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                Assigned: {asg.auditor?.name}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: '#dc2626', background: '#fee2e2', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                Unassigned
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mode 2: Branch selector */}
              {modalMode === 'branch' && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                    Select Branch Name:
                  </label>
                  <select
                    value={modalBranch}
                    onChange={(e) => setModalBranch(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8 }}
                  >
                    <option value="">-- Choose Branch --</option>
                    {branchList.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name} ({b.count} ATM{b.count > 1 ? 's' : ''})
                      </option>
                    ))}
                  </select>

                  {modalBranch && (
                    <div style={{ marginTop: 10, padding: 10, background: '#f1f5f9', borderRadius: 8, fontSize: '0.85rem', color: '#334155' }}>
                      ℹ️ All ATMs belonging to <strong>{modalBranch}</strong> will be assigned to the selected auditor.
                    </div>
                  )}
                </div>
              )}

              {/* Mode 3: Zone selector */}
              {modalMode === 'zone' && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                    Select Zone / Area:
                  </label>
                  <select
                    value={modalZone}
                    onChange={(e) => setModalZone(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8 }}
                  >
                    <option value="">-- Choose Zone / Area --</option>
                    {zoneList.map((z) => (
                      <option key={z.name} value={z.name}>
                        {z.name} ({z.count} ATM{z.count > 1 ? 's' : ''})
                      </option>
                    ))}
                  </select>

                  {modalZone && (
                    <div style={{ marginTop: 10, padding: 10, background: '#f1f5f9', borderRadius: 8, fontSize: '0.85rem', color: '#334155' }}>
                      ℹ️ All ATMs located in <strong>{modalZone}</strong> will be assigned to the selected auditor.
                    </div>
                  )}
                </div>
              )}

              {/* Auditor Selection (Required) */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                  Select Auditor to Assign to *
                </label>
                <select
                  value={modalAuditorId}
                  onChange={(e) => setModalAuditorId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: '0.95rem' }}
                >
                  <option value="">-- Select Auditor --</option>
                  {auditors.map((aud) => (
                    <option key={aud._id || aud.id} value={aud._id || aud.id}>
                      {aud.name} (@{aud.username})
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
                <button
                  type="button"
                  onClick={closeAssignModal}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 8,
                    background: '#f1f5f9',
                    border: '1px solid var(--color-border)',
                    color: '#334155',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={modalSubmitting}
                  style={{
                    padding: '10px 22px',
                    borderRadius: 8,
                    background: 'var(--color-primary)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                  }}
                >
                  {modalSubmitting ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
