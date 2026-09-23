import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AdminNav from '../components/AdminNav';

export default function AdminAtms() {
  const { user, logout } = useAuth();
  const [atms, setAtms] = useState([]);
  const [areas, setAreas] = useState([]);
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [siteTypeFilter, setSiteTypeFilter] = useState('');

  // Modals state
  const [detailAtm, setDetailAtm] = useState(null);
  const [editingAtm, setEditingAtm] = useState(null);
  const [atmToDelete, setAtmToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Notifications
  const [feedback, setFeedback] = useState(null);

  // Single ATM form
  const [slNo, setSlNo] = useState('');
  const [atmId, setAtmId] = useState('');
  const [area, setArea] = useState('');
  const [vendor, setVendor] = useState('Provigil');
  const [bic, setBic] = useState('');
  const [branchName, setBranchName] = useState('');
  const [inchargeName, setInchargeName] = useState('');
  const [inchargeDesig, setInchargeDesig] = useState('');
  const [inchargeContact, setInchargeContact] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('DELHI');
  const [siteType, setSiteType] = useState('ONSITE');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addError, setAddError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Bulk Excel Upload state
  const [showUploadCard, setShowUploadCard] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [excelMsg, setExcelMsg] = useState(null);
  const [excelError, setExcelError] = useState('');
  const fileInputRef = useRef(null);

  // Link Sync from Excel state
  const [linkFile, setLinkFile] = useState(null);
  const [uploadingLinks, setUploadingLinks] = useState(false);
  const [linkMsg, setLinkMsg] = useState(null);
  const [linkError, setLinkError] = useState('');
  const linkFileInputRef = useRef(null);

  // Edit ATM state
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  function showToast(text, type = 'success') {
    setFeedback({ text, type });
    setTimeout(() => {
      setFeedback(null);
    }, 5000);
  }

  function loadAtms() {
    api.get('/atms').then((res) => setAtms(res.data));
  }

  function loadAreas() {
    api.get('/areas').then((res) => setAreas(res.data));
  }

  useEffect(() => {
    loadAtms();
    loadAreas();
  }, []);

  const vendors = useMemo(() => {
    const list = new Set();
    atms.forEach((a) => {
      if (a.vendor) list.add(a.vendor);
    });
    return Array.from(list);
  }, [atms]);

  // Statistics
  const stats = useMemo(() => {
    const total = atms.length;
    const provigil = atms.filter((a) => a.vendor?.toLowerCase().includes('provigil')).length;
    const cms = atms.filter((a) => a.vendor?.toLowerCase().includes('cms')).length;
    const zones = new Set(atms.map((a) => a.area?.name || a.zone).filter(Boolean)).size;
    const withLinks = atms.filter((a) => a.link || (a.links && a.links.length > 0)).length;
    return { total, provigil, cms, zones, withLinks };
  }, [atms]);

  const filteredAtms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return atms.filter((a) => {
      if (vendorFilter && a.vendor !== vendorFilter) return false;
      if (zoneFilter && a.area?.name !== zoneFilter && a.zone !== zoneFilter) return false;
      if (siteTypeFilter && a.siteType !== siteTypeFilter) return false;
      if (!q) return true;
      return (
        a.atmId.toLowerCase().includes(q) ||
        (a.branchName && a.branchName.toLowerCase().includes(q)) ||
        (a.address && a.address.toLowerCase().includes(q)) ||
        (a.area?.name && a.area.name.toLowerCase().includes(q)) ||
        (a.state && a.state.toLowerCase().includes(q)) ||
        (a.vendor && a.vendor.toLowerCase().includes(q)) ||
        (a.inchargeName && a.inchargeName.toLowerCase().includes(q)) ||
        (a.inchargeContact && a.inchargeContact.toLowerCase().includes(q)) ||
        (a.inchargeDesig && a.inchargeDesig.toLowerCase().includes(q)) ||
        (a.bic && a.bic.toLowerCase().includes(q)) ||
        (a.pincode && a.pincode.toLowerCase().includes(q))
      );
    });
  }, [atms, search, vendorFilter, zoneFilter, siteTypeFilter]);

  async function handleAddSubmit(e) {
    e.preventDefault();
    setAddError('');
    setSubmitting(true);
    try {
      await api.post('/atms', {
        slNo: Number(slNo) || 0,
        atmId,
        area,
        vendor,
        bic,
        branchName,
        inchargeName,
        inchargeDesig,
        inchargeContact,
        address,
        pincode,
        state,
        siteType,
      });
      showToast(`ATM ${atmId} added successfully!`);
      setSlNo('');
      setAtmId('');
      setArea('');
      setVendor('Provigil');
      setBic('');
      setBranchName('');
      setInchargeName('');
      setInchargeDesig('');
      setInchargeContact('');
      setAddress('');
      setPincode('');
      setState('DELHI');
      setShowAddForm(false);
      loadAtms();
      loadAreas();
    } catch (err) {
      setAddError(err.response?.data?.message || 'Failed to add ATM');
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFile(file);
    setExcelMsg(null);
    setExcelError('');
  }

  async function handleExcelUpload() {
    if (!excelFile) {
      setExcelError('Please select an Excel or CSV file first');
      return;
    }

    setUploadingExcel(true);
    setExcelError('');
    setExcelMsg(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result;
          const res = await api.post('/atms/import-excel', {
            fileBase64: base64Data,
            fileName: excelFile.name,
          });

          setExcelMsg(res.data);
          setExcelFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          showToast('Excel file imported successfully!');
          loadAtms();
          loadAreas();
        } catch (err) {
          setExcelError(err.response?.data?.message || 'Failed to process Excel file');
        } finally {
          setUploadingExcel(false);
        }
      };

      reader.onerror = () => {
        setExcelError('Failed to read file from disk');
        setUploadingExcel(false);
      };

      reader.readAsDataURL(excelFile);
    } catch (err) {
      setExcelError(err.message || 'Upload failed');
      setUploadingExcel(false);
    }
  }

  function handleLinkFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLinkFile(file);
    setLinkMsg(null);
    setLinkError('');
  }

  async function handleLinkUpload() {
    if (!linkFile) {
      setLinkError('Please select an Excel or CSV file first');
      return;
    }
    setUploadingLinks(true);
    setLinkError('');
    setLinkMsg(null);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result;
          const res = await api.post('/atms/import-links', {
            fileBase64: base64Data,
          });
          setLinkMsg(res.data);
          setLinkFile(null);
          if (linkFileInputRef.current) linkFileInputRef.current.value = '';
          showToast(res.data.message || `Successfully linked ${res.data.updatedCount} ATM(s)!`);
          loadAtms();
        } catch (err) {
          setLinkError(err.response?.data?.message || 'Failed to sync links');
        } finally {
          setUploadingLinks(false);
        }
      };
      reader.onerror = () => {
        setLinkError('Failed to read file from disk');
        setUploadingLinks(false);
      };
      reader.readAsDataURL(linkFile);
    } catch (err) {
      setLinkError(err.message || 'Upload failed');
      setUploadingLinks(false);
    }
  }

  function exportFilteredCSV() {
    if (filteredAtms.length === 0) return;
    const headers = [
      'SLNO',
      'ATMID',
      'VENDOR',
      'BIC',
      'BRANCH NAME',
      'PRESENT_INCHARGE',
      'INCHARGE_DESIG',
      'INCHARGE_CONTACT',
      'ZONE',
      'ADDRESS',
      'PINCODE',
      'STATE',
      'SITE_TYPE',
      'IR_LINK',
      'DEVICE_ID',
    ];
    const rows = filteredAtms.map((a, i) => [
      !vendorFilter ? i + 1 : (a.slNo || i + 1),
      `"${a.atmId || ''}"`,
      `"${a.vendor || ''}"`,
      `"${a.bic || ''}"`,
      `"${(a.branchName || a.location || '').replace(/"/g, '""')}"`,
      `"${(a.inchargeName || '').replace(/"/g, '""')}"`,
      `"${(a.inchargeDesig || '').replace(/"/g, '""')}"`,
      `"${a.inchargeContact || ''}"`,
      `"${a.area?.name || a.zone || ''}"`,
      `"${(a.address || '').replace(/"/g, '""')}"`,
      `"${a.pincode || ''}"`,
      `"${a.state || ''}"`,
      `"${a.siteType || ''}"`,
      `"${a.link || ''}"`,
      `"${a.deviceId || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `atm_list_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function startEdit(atm) {
    setEditingAtm({
      ...atm,
      areaId: atm.areaId || atm.area?._id || atm.area?.id || '',
    });
    setEditError('');
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editingAtm.atmId.trim() || !editingAtm.areaId) {
      setEditError('ATM ID and Area are required');
      return;
    }
    setSavingEdit(true);
    setEditError('');
    try {
      const id = editingAtm._id || editingAtm.id;
      await api.put(`/atms/${id}`, {
        slNo: Number(editingAtm.slNo) || 0,
        atmId: editingAtm.atmId.trim(),
        area: editingAtm.areaId,
        vendor: editingAtm.vendor,
        bic: editingAtm.bic,
        branchName: editingAtm.branchName,
        inchargeName: editingAtm.inchargeName,
        inchargeDesig: editingAtm.inchargeDesig,
        inchargeContact: editingAtm.inchargeContact,
        address: editingAtm.address,
        pincode: editingAtm.pincode,
        state: editingAtm.state,
        siteType: editingAtm.siteType,
        link: editingAtm.link,
        deviceId: editingAtm.deviceId,
      });
      showToast(`ATM ${editingAtm.atmId} updated successfully!`);
      setEditingAtm(null);
      loadAtms();
      loadAreas();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update ATM');
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDeleteAtm() {
    if (!atmToDelete) return;
    setDeleting(true);
    try {
      const id = atmToDelete._id || atmToDelete.id;
      await api.delete(`/atms/${id}`);
      showToast(`ATM ${atmToDelete.atmId} deleted successfully!`);
      setAtmToDelete(null);
      loadAtms();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete ATM', 'error');
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
        {/* Toast / Feedback Banner */}
        {feedback && (
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 18,
              fontSize: '0.92rem',
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: feedback.type === 'error' ? 'var(--color-danger-soft)' : 'var(--color-success-soft)',
              color: feedback.type === 'error' ? 'var(--color-danger)' : 'var(--color-success)',
              border: `1px solid ${feedback.type === 'error' ? '#fca5a5' : '#86efac'}`,
              animation: 'modalPopIn 0.2s ease',
            }}
          >
            <span>{feedback.type === 'error' ? '⚠️ ' : '✅ '} {feedback.text}</span>
            <button
              type="button"
              className="link"
              onClick={() => setFeedback(null)}
              style={{ color: 'inherit', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Header Title & Actions */}
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
            <h1 style={{ margin: 0, fontSize: '1.65rem' }}>ATM Master Directory</h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
              Integrated with Provigil & CMS site inventory
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={exportFilteredCSV}
              title="Export visible list to CSV"
            >
              📥 Export CSV
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowUploadCard(!showUploadCard)}
            >
              📊 {showUploadCard ? 'Hide Excel Tool' : 'Excel Import'}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? '✕ Close Form' : '+ Add New ATM'}
            </button>
          </div>
        </div>

        {/* KPI Metrics Strip */}
        <div className="kpi-grid">
          <div className="kpi-card" style={{ '--kpi-accent': '#2563eb' }}>
            <div className="kpi-header">
              <span className="kpi-label">Total ATM Sites</span>
              <span className="kpi-icon">🏦</span>
            </div>
            <div className="kpi-value">{stats.total}</div>
            <div className="kpi-subtext">Active audit inventory</div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': '#0284c7' }}>
            <div className="kpi-header">
              <span className="kpi-label">Provigil Vendor</span>
              <span className="kpi-icon">🛡️</span>
            </div>
            <div className="kpi-value" style={{ color: '#0284c7' }}>
              {stats.provigil}
            </div>
            <div className="kpi-subtext">{Math.round((stats.provigil / (stats.total || 1)) * 100)}% of total network</div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': '#d97706' }}>
            <div className="kpi-header">
              <span className="kpi-label">CMS Vendor</span>
              <span className="kpi-icon">⚡</span>
            </div>
            <div className="kpi-value" style={{ color: '#d97706' }}>
              {stats.cms}
            </div>
            <div className="kpi-subtext">{Math.round((stats.cms / (stats.total || 1)) * 100)}% of total network</div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': '#10b981' }}>
            <div className="kpi-header">
              <span className="kpi-label">Operating Zones</span>
              <span className="kpi-icon">📍</span>
            </div>
            <div className="kpi-value" style={{ color: '#059669' }}>
              {stats.zones}
            </div>
            <div className="kpi-subtext">Delhi, Gurugram, Jaipur</div>
          </div>

          <div className="kpi-card" style={{ '--kpi-accent': '#06b6d4' }}>
            <div className="kpi-header">
              <span className="kpi-label">Linked Sites</span>
              <span className="kpi-icon">🔗</span>
            </div>
            <div className="kpi-value" style={{ color: '#0891b2' }}>
              {stats.withLinks}
            </div>
            <div className="kpi-subtext">
              {Math.round((stats.withLinks / (stats.total || 1)) * 100)}% with IR / Site Link
            </div>
          </div>
        </div>

        {/* Bulk Excel Upload Card (Collapsible) */}
        {showUploadCard && (
          <div
            style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
              border: '1px solid #bfdbfe',
              borderRadius: 'var(--radius-md)',
              padding: '18px 22px',
              marginBottom: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', color: '#1e3a8a' }}>
                  📊 Import Additional ATMs from Excel Sheet
                </h3>
                <p style={{ margin: 0, fontSize: '0.86rem', color: '#475569' }}>
                  Select any <strong>.xlsx, .xls, or .csv</strong> workbook. Multi-sheet Provigil/CMS structure and headers are auto-detected.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileSelect}
                  style={{ fontSize: '0.85rem', width: 'auto' }}
                />
                <button
                  type="button"
                  onClick={handleExcelUpload}
                  disabled={!excelFile || uploadingExcel}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {uploadingExcel ? 'Importing Data...' : '🚀 Process & Import'}
                </button>
              </div>
            </div>

            {excelFile && !uploadingExcel && !excelMsg && (
              <div style={{ marginTop: 10, fontSize: '0.85rem', color: '#1e3a8a', fontWeight: 600 }}>
                Selected File: {excelFile.name} ({(excelFile.size / 1024).toFixed(1)} KB)
              </div>
            )}

            {excelMsg && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: 'white',
                  border: '1px solid #86efac',
                  borderRadius: 'var(--radius-sm)',
                  color: '#15803d',
                  fontSize: '0.9rem',
                }}
              >
                ✅ <strong>{excelMsg.message}!</strong>
                <div style={{ marginTop: 4, fontSize: '0.84rem' }}>
                  Total Rows: <strong>{excelMsg.totalRows}</strong> | New: <strong>{excelMsg.created}</strong> | Updated:{' '}
                  <strong>{excelMsg.updated}</strong>
                  {excelMsg.newAreasCreated?.length > 0 && (
                    <span> | New Zones: {excelMsg.newAreasCreated.join(', ')}</span>
                  )}
                </div>
              </div>
            )}

            {excelError && (
              <p className="error" style={{ marginTop: 10, marginBottom: 0 }}>
                {excelError}
              </p>
            )}

            {/* Divider & Link Sync Tool */}
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #bfdbfe' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: '0.98rem', color: '#0369a1' }}>
                    🔗 Sync / Match ATM Links from Excel
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: '#475569' }}>
                    Upload any sheet with <strong>ATMID</strong> and <strong>Link / Installation Reports</strong> columns to attach reference links.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    ref={linkFileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleLinkFileSelect}
                    style={{ fontSize: '0.85rem', width: 'auto' }}
                  />
                  <button
                    type="button"
                    onClick={handleLinkUpload}
                    disabled={!linkFile || uploadingLinks}
                    style={{
                      whiteSpace: 'nowrap',
                      background: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                    }}
                  >
                    {uploadingLinks ? 'Matching Links...' : '🔗 Match & Attach Links'}
                  </button>
                </div>
              </div>

              {linkFile && !uploadingLinks && !linkMsg && (
                <div style={{ marginTop: 8, fontSize: '0.84rem', color: '#0369a1', fontWeight: 600 }}>
                  Selected File: {linkFile.name} ({(linkFile.size / 1024).toFixed(1)} KB)
                </div>
              )}

              {linkMsg && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    background: 'white',
                    border: '1px solid #7dd3fc',
                    borderRadius: 'var(--radius-sm)',
                    color: '#0369a1',
                    fontSize: '0.88rem',
                  }}
                >
                  ✓ {linkMsg.message} (Processed {linkMsg.totalRows} rows)
                </div>
              )}

              {linkError && (
                <p className="error" style={{ marginTop: 8, marginBottom: 0 }}>
                  {linkError}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Add ATM Form (Collapsible) */}
        {showAddForm && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 22,
              marginBottom: 24,
              boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: 'var(--color-primary-dark)' }}>
              Add New ATM Site
            </h3>
            <form onSubmit={handleAddSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div>
                  <label>SL NO</label>
                  <input placeholder="e.g. 101" value={slNo} onChange={(e) => setSlNo(e.target.value)} type="number" />
                </div>
                <div>
                  <label>ATM ID *</label>
                  <input placeholder="e.g. SPSBV000701" value={atmId} onChange={(e) => setAtmId(e.target.value)} required />
                </div>
                <div>
                  <label>Zone / Area *</label>
                  <select value={area} onChange={(e) => setArea(e.target.value)} required>
                    <option value="">Select Zone</option>
                    {areas.map((a) => (
                      <option key={a._id || a.id} value={a._id || a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Vendor</label>
                  <input placeholder="e.g. Provigil / CMS" value={vendor} onChange={(e) => setVendor(e.target.value)} />
                </div>
                <div>
                  <label>BIC Code</label>
                  <input placeholder="e.g. D0007" value={bic} onChange={(e) => setBic(e.target.value)} />
                </div>
                <div>
                  <label>Branch Name</label>
                  <input placeholder="e.g. CHANDNI CHOWK, DELHI" value={branchName} onChange={(e) => setBranchName(e.target.value)} />
                </div>
                <div>
                  <label>Site Type</label>
                  <select value={siteType} onChange={(e) => setSiteType(e.target.value)}>
                    <option value="ONSITE">ONSITE</option>
                    <option value="OFFSITE">OFFSITE</option>
                    <option value="CRM">CRM</option>
                  </select>
                </div>
                <div>
                  <label>Present In-Charge</label>
                  <input placeholder="e.g. Satyam Gupta" value={inchargeName} onChange={(e) => setInchargeName(e.target.value)} />
                </div>
                <div>
                  <label>In-Charge Designation</label>
                  <input placeholder="e.g. ASST GENERAL MANAGER- IN CHARGE" value={inchargeDesig} onChange={(e) => setInchargeDesig(e.target.value)} />
                </div>
                <div>
                  <label>In-Charge Contact</label>
                  <input placeholder="e.g. 9781079333" value={inchargeContact} onChange={(e) => setInchargeContact(e.target.value)} />
                </div>
                <div>
                  <label>Pincode</label>
                  <input placeholder="e.g. 110006" value={pincode} onChange={(e) => setPincode(e.target.value)} />
                </div>
                <div>
                  <label>State</label>
                  <input placeholder="e.g. DELHI / HARYANA" value={state} onChange={(e) => setState(e.target.value)} />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label>Full Address</label>
                  <input
                    placeholder="e.g. 1902, Chandni Chowk, Opposite Gurudware sis Ganj Sahib..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save ATM'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
            {addError && <p className="error" style={{ marginTop: 14 }}>{addError}</p>}
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="filter-bar">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              placeholder={`Search ${atms.length} ATMs by ID, BIC, Branch, In-Charge, Zone, Phone...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="link"
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem' }}
              >
                ✕
              </button>
            )}
          </div>

          <select className="filter-select" value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
            <option value="">All Vendors ({atms.length})</option>
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v} ({atms.filter((a) => a.vendor === v).length})
              </option>
            ))}
          </select>

          <select className="filter-select" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
            <option value="">All Zones ({areas.length})</option>
            {areas.map((ar) => (
              <option key={ar.name} value={ar.name}>
                {ar.name}
              </option>
            ))}
          </select>

          <select className="filter-select" value={siteTypeFilter} onChange={(e) => setSiteTypeFilter(e.target.value)}>
            <option value="">All Site Types</option>
            <option value="ONSITE">ONSITE</option>
            <option value="OFFSITE">OFFSITE</option>
            <option value="CRM">CRM</option>
          </select>

          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginLeft: 'auto', fontWeight: 600 }}>
            Showing <strong>{filteredAtms.length}</strong> of {atms.length}
          </span>
        </div>

        {/* Modern ATM Table */}
        {filteredAtms.length === 0 ? (
          <p className="empty-state">No matching ATMs found for your search criteria.</p>
        ) : (
          <div className="modern-table-container">
            <table className="modern-table">
              <thead>
                <tr>
                  <th style={{ width: 50, textAlign: 'center' }}>#</th>
                  <th>ATM ID</th>
                  <th>Vendor</th>
                  <th>BIC</th>
                  <th>Branch Name</th>
                  <th>Present In-Charge</th>
                  <th>Designation</th>
                  <th>Contact</th>
                  <th>Zone</th>
                  <th>State</th>
                  <th>Site Type</th>
                  <th>IR Link</th>
                  <th>Address</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAtms.map((a, idx) => {
                  const isProvigil = a.vendor?.toLowerCase().includes('provigil');
                  const siteClass =
                    a.siteType === 'CRM'
                      ? 'badge-site-crm'
                      : a.siteType === 'OFFSITE'
                      ? 'badge-site-offsite'
                      : 'badge-site-onsite';

                  return (
                    <tr key={a._id || a.id}>
                      <td style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        {!vendorFilter ? idx + 1 : (a.slNo || idx + 1)}
                      </td>
                      <td>
                        <strong style={{ color: 'var(--color-primary-dark)', fontSize: '0.92rem' }}>
                          {a.atmId}
                        </strong>
                      </td>
                      <td>
                        {a.vendor ? (
                          <span className={`badge ${isProvigil ? 'badge-provigil' : 'badge-cms'}`}>{a.vendor}</span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: '0.8rem' }}>
                          {a.bic || '-'}
                        </code>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{a.branchName || a.location || '-'}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{a.inchargeName || '-'}</div>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', maxWidth: 170 }}>
                        {a.inchargeDesig || '-'}
                      </td>
                      <td>
                        {a.inchargeContact ? (
                          <a href={`tel:${a.inchargeContact}`} className="phone-pill">
                            📞 {a.inchargeContact}
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <span className="badge badge-zone">{a.area?.name || a.zone || '-'}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{a.state || '-'}</span>
                      </td>
                      <td>
                        {a.siteType ? <span className={`badge ${siteClass}`}>{a.siteType}</span> : '-'}
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {((a.links && a.links.length > 0) ? a.links : a.link ? [a.link] : []).length > 0 ? (
                          <div style={{ display: 'inline-flex', gap: 4 }}>
                            {((a.links && a.links.length > 0) ? a.links : [a.link]).map((l, i, arr) => (
                              <a
                                key={i}
                                href={l}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  padding: '3px 7px',
                                  borderRadius: 5,
                                  background: '#e0f2fe',
                                  color: '#0369a1',
                                  fontSize: '0.76rem',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                }}
                                title={`Open Link ${arr.length > 1 ? `#${i + 1}` : ''}`}
                              >
                                🔗 {arr.length > 1 ? `Link ${i + 1}` : 'View'} ↗
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>-</span>
                        )}
                      </td>
                      <td style={{ minWidth: 260, maxWidth: 380, fontSize: '0.82rem', lineHeight: 1.45 }}>
                        <div style={{ color: 'var(--color-text)', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                          {a.address || '-'}
                        </div>
                        {a.pincode && (
                          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 3, fontWeight: 500 }}>
                            📮 PIN: {a.pincode}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setDetailAtm(a)}
                            style={{ padding: '5px 10px', fontSize: '0.8rem', borderRadius: 6, cursor: 'pointer' }}
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => startEdit(a)}
                            style={{ padding: '5px 10px', fontSize: '0.8rem', borderRadius: 6, cursor: 'pointer' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="link"
                            onClick={() => setAtmToDelete(a)}
                            style={{
                              fontSize: '0.8rem',
                              color: 'var(--color-danger)',
                              marginLeft: 4,
                              cursor: 'pointer',
                              padding: '5px 8px',
                            }}
                          >
                            Delete
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

      {/* ATM Details Modal */}
      {detailAtm && (
        <div className="modal-backdrop" onClick={() => setDetailAtm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 660, padding: 28 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 18,
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: 14,
              }}
            >
              <div>
                <span
                  className={`badge ${
                    detailAtm.vendor?.toLowerCase().includes('provigil') ? 'badge-provigil' : 'badge-cms'
                  }`}
                  style={{ marginBottom: 6 }}
                >
                  {detailAtm.vendor || 'ATM Site'}
                </span>
                <h2 style={{ margin: 0, border: 'none', padding: 0, fontSize: '1.35rem', color: 'var(--color-primary-dark)' }}>
                  {detailAtm.atmId} &mdash; {detailAtm.branchName || detailAtm.location}
                </h2>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDetailAtm(null)}
                style={{ padding: '6px 12px', borderRadius: 999 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: '0.92rem' }}>
              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                  Serial No
                </span>
                <strong>{detailAtm.slNo || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                  BIC Code
                </span>
                <code>{detailAtm.bic || '-'}</code>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                  Operating Zone
                </span>
                <span className="badge badge-zone">{detailAtm.area?.name || detailAtm.zone || '-'}</span>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                  Site Type
                </span>
                <strong>{detailAtm.siteType || 'ONSITE'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                  State
                </span>
                <strong>{detailAtm.state || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                  Postal PIN
                </span>
                <strong>{detailAtm.pincode || '-'}</strong>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                  Complete Address
                </span>
                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, marginTop: 4 }}>
                  {detailAtm.address || '-'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                  Present In-Charge
                </span>
                <strong>{detailAtm.inchargeName || '-'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                  Direct Contact
                </span>
                {detailAtm.inchargeContact ? (
                  <a href={`tel:${detailAtm.inchargeContact}`} className="phone-pill" style={{ marginTop: 4 }}>
                    📞 {detailAtm.inchargeContact}
                  </a>
                ) : (
                  '-'
                )}
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                  Designation
                </span>
                <div style={{ color: '#475569', marginTop: 2 }}>{detailAtm.inchargeDesig || '-'}</div>
              </div>
              {detailAtm.deviceId && (
                <div>
                  <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                    Unit / Device ID
                  </span>
                  <code>{detailAtm.deviceId}</code>
                </div>
              )}
              {(detailAtm.link || (detailAtm.links && detailAtm.links.length > 0)) && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block' }}>
                    Installation / Site Reference Link
                  </span>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(detailAtm.links && detailAtm.links.length > 0 ? detailAtm.links : [detailAtm.link]).map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 14px',
                          background: '#0284c7',
                          color: '#ffffff',
                          borderRadius: 6,
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          textDecoration: 'none',
                        }}
                      >
                        🔗 Open Site Link {detailAtm.links?.length > 1 ? `#${i + 1}` : ''} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, textAlign: 'right', borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
              <button type="button" className="btn-secondary" onClick={() => setDetailAtm(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit ATM Modal */}
      {editingAtm && (
        <div className="modal-backdrop" onClick={() => setEditingAtm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700, padding: 26 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ margin: 0, border: 'none', padding: 0, fontSize: '1.25rem' }}>
                Edit ATM: {editingAtm.atmId}
              </h2>
              <button type="button" className="btn-secondary" onClick={() => setEditingAtm(null)} style={{ padding: '4px 10px', borderRadius: 999 }}>
                ✕
              </button>
            </div>

            <form onSubmit={saveEdit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label>SL NO</label>
                  <input
                    type="number"
                    value={editingAtm.slNo || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, slNo: e.target.value })}
                  />
                </div>
                <div>
                  <label>ATM ID *</label>
                  <input
                    value={editingAtm.atmId || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, atmId: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label>Zone / Area *</label>
                  <select
                    value={editingAtm.areaId || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, areaId: e.target.value })}
                    required
                  >
                    <option value="">Select Zone</option>
                    {areas.map((ar) => (
                      <option key={ar._id || ar.id} value={ar._id || ar.id}>
                        {ar.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Vendor</label>
                  <input
                    value={editingAtm.vendor || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, vendor: e.target.value })}
                  />
                </div>
                <div>
                  <label>BIC Code</label>
                  <input
                    value={editingAtm.bic || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, bic: e.target.value })}
                  />
                </div>
                <div>
                  <label>Branch Name</label>
                  <input
                    value={editingAtm.branchName || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, branchName: e.target.value })}
                  />
                </div>
                <div>
                  <label>Site Type</label>
                  <select
                    value={editingAtm.siteType || 'ONSITE'}
                    onChange={(e) => setEditingAtm({ ...editingAtm, siteType: e.target.value })}
                  >
                    <option value="ONSITE">ONSITE</option>
                    <option value="OFFSITE">OFFSITE</option>
                    <option value="CRM">CRM</option>
                  </select>
                </div>
                <div>
                  <label>State</label>
                  <input
                    value={editingAtm.state || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, state: e.target.value })}
                  />
                </div>
                <div>
                  <label>Present In-Charge</label>
                  <input
                    value={editingAtm.inchargeName || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, inchargeName: e.target.value })}
                  />
                </div>
                <div>
                  <label>In-Charge Contact</label>
                  <input
                    value={editingAtm.inchargeContact || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, inchargeContact: e.target.value })}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label>In-Charge Designation</label>
                  <input
                    value={editingAtm.inchargeDesig || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, inchargeDesig: e.target.value })}
                  />
                </div>
                <div>
                  <label>Pincode</label>
                  <input
                    value={editingAtm.pincode || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, pincode: e.target.value })}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label>Full Address</label>
                  <input
                    value={editingAtm.address || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, address: e.target.value })}
                  />
                </div>
                <div>
                  <label>Unit / Device ID</label>
                  <input
                    placeholder="e.g. PNSBP1A1001"
                    value={editingAtm.deviceId || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, deviceId: e.target.value })}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label>Installation / Site Link</label>
                  <input
                    placeholder="https://..."
                    value={editingAtm.link || ''}
                    onChange={(e) => setEditingAtm({ ...editingAtm, link: e.target.value })}
                  />
                </div>
              </div>

              {editError && <p className="error" style={{ marginTop: 14 }}>{editError}</p>}

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingAtm(null)}>
                  Cancel
                </button>
                <button type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {atmToDelete && (
        <div className="modal-backdrop" onClick={() => setAtmToDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, padding: 26 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'var(--color-danger-soft)',
                  color: 'var(--color-danger)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                  fontSize: '1.5rem',
                }}
              >
                🗑️
              </div>
              <h2 style={{ margin: '0 0 6px', border: 'none', padding: 0, fontSize: '1.25rem' }}>
                Delete ATM Site?
              </h2>
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                Are you sure you want to remove <strong>{atmToDelete.atmId}</strong> &mdash;{' '}
                {atmToDelete.branchName || atmToDelete.location}? This action cannot be undone.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 22 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setAtmToDelete(null)}
                style={{ minWidth: 100 }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAtm}
                style={{
                  background: 'var(--color-danger)',
                  minWidth: 120,
                }}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
