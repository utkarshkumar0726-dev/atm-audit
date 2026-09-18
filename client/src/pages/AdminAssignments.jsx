import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AdminNav from '../components/AdminNav';

const MAX_RESULTS = 20;

export default function AdminAssignments() {
  const { user, logout } = useAuth();
  const [auditors, setAuditors] = useState([]);
  const [atms, setAtms] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [auditorId, setAuditorId] = useState('');
  const [atmId, setAtmId] = useState('');
  const [atmSearch, setAtmSearch] = useState('');
  const [atmDropdownOpen, setAtmDropdownOpen] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function loadAssignments() {
    api.get('/assignments').then((res) => setAssignments(res.data));
  }

  useEffect(() => {
    api.get('/auth/auditors').then((res) => setAuditors(res.data));
    api.get('/atms').then((res) => setAtms(res.data));
    loadAssignments();
  }, []);

  const filteredAtms = useMemo(() => {
    const q = atmSearch.trim().toLowerCase();
    const list = q
      ? atms.filter(
          (a) =>
            a.atmId.toLowerCase().includes(q) ||
            a.location.toLowerCase().includes(q) ||
            a.area?.name?.toLowerCase().includes(q)
        )
      : atms;
    return list.slice(0, MAX_RESULTS);
  }, [atms, atmSearch]);

  const selectedAtm = atms.find((a) => a._id === atmId);

  function selectAtm(atm) {
    setAtmId(atm._id);
    setAtmSearch('');
    setAtmDropdownOpen(false);
  }

  function closeAtmDropdownSoon() {
    setTimeout(() => setAtmDropdownOpen(false), 120);
  }

  async function handleAssign(e) {
    e.preventDefault();
    setError('');
    if (!auditorId || !atmId) {
      setError('Select an auditor and an ATM');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/assignments', { auditorId, atmId });
      setAtmId('');
      setAtmSearch('');
      loadAssignments();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign');
    } finally {
      setSubmitting(false);
    }
  }

  async function unassign(id) {
    setError('');
    try {
      await api.delete(`/assignments/${id}`);
      loadAssignments();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to unassign');
    }
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
        <h1>Assign ATMs to Auditors</h1>
        <p style={{ marginTop: -10, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          An auditor can only start audits for ATMs assigned to them here.
        </p>

        <form onSubmit={handleAssign} className="inline-form">
          <select value={auditorId} onChange={(e) => setAuditorId(e.target.value)} required>
            <option value="">Select auditor</option>
            {auditors.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name} ({a.username})
              </option>
            ))}
          </select>

          <div className="atm-picker" style={{ flex: 1, minWidth: 200 }}>
            <input
              value={selectedAtm ? `${selectedAtm.atmId} — ${selectedAtm.area?.name}` : atmSearch}
              onChange={(e) => {
                setAtmId('');
                setAtmSearch(e.target.value);
                setAtmDropdownOpen(true);
              }}
              onFocus={() => setAtmDropdownOpen(true)}
              onBlur={closeAtmDropdownSoon}
              placeholder="Search ATM by ID, area, or location..."
            />
            {atmDropdownOpen && (
              <div className="atm-dropdown">
                {filteredAtms.length === 0 && <div className="atm-dropdown-empty">No matching ATMs</div>}
                {filteredAtms.map((a) => (
                  <div key={a._id} className="atm-dropdown-item" onClick={() => selectAtm(a)}>
                    <strong>{a.atmId}</strong>
                    <span>
                      {a.area?.name} &middot; {a.location}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Assigning...' : 'Assign'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}

        {assignments.length === 0 ? (
          <p className="empty-state">No assignments yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Auditor</th>
                <th>ATM ID</th>
                <th>Area</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a._id}>
                  <td>{a.auditor?.name}</td>
                  <td>{a.atm?.atmId}</td>
                  <td>{a.atm?.area?.name}</td>
                  <td>
                    <button type="button" className="link" onClick={() => unassign(a._id)}>
                      Unassign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
