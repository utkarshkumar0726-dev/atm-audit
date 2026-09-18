import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AdminNav from '../components/AdminNav';

export default function AdminAtms() {
  const { user, logout } = useAuth();
  const [atms, setAtms] = useState([]);
  const [areas, setAreas] = useState([]);
  const [search, setSearch] = useState('');

  const [atmId, setAtmId] = useState('');
  const [area, setArea] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editAtmId, setEditAtmId] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  function loadAtms() {
    api.get('/atms').then((res) => setAtms(res.data));
  }

  useEffect(() => {
    loadAtms();
    api.get('/areas').then((res) => setAreas(res.data));
  }, []);

  const filteredAtms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return atms;
    return atms.filter(
      (a) =>
        a.atmId.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q) ||
        a.area?.name?.toLowerCase().includes(q)
    );
  }, [atms, search]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/atms', { atmId, area, location });
      setAtmId('');
      setArea('');
      setLocation('');
      loadAtms();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add ATM');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(atm) {
    setEditingId(atm._id);
    setEditAtmId(atm.atmId);
    setEditArea(atm.area?._id || '');
    setEditLocation(atm.location);
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  async function saveEdit(id) {
    setEditError('');
    if (!editAtmId.trim() || !editArea) {
      setEditError('ATM ID and area are required');
      return;
    }
    setSavingEdit(true);
    try {
      await api.put(`/atms/${id}`, { atmId: editAtmId.trim(), area: editArea, location: editLocation });
      setEditingId(null);
      loadAtms();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update ATM');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteAtm(id) {
    setError('');
    try {
      await api.delete(`/atms/${id}`);
      loadAtms();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete ATM');
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
        <h1>ATM Master List</h1>

        <form onSubmit={handleSubmit} className="inline-form">
          <input placeholder="ATM ID (e.g. ATM-1101)" value={atmId} onChange={(e) => setAtmId(e.target.value)} required />
          <select value={area} onChange={(e) => setArea(e.target.value)} required>
            <option value="">Select area</option>
            {areas.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
          <input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add ATM'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}

        <input
          placeholder={`Search ${atms.length} ATMs by ID, area, or location...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        {filteredAtms.length === 0 ? (
          <p className="empty-state">No matching ATMs.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ATM ID</th>
                <th>Area</th>
                <th>Location</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredAtms.map((a) =>
                editingId === a._id ? (
                  <tr key={a._id}>
                    <td colSpan={4}>
                      <div className="inline-form" style={{ margin: 0, background: 'transparent', border: 'none', padding: 0 }}>
                        <input value={editAtmId} onChange={(e) => setEditAtmId(e.target.value)} />
                        <select value={editArea} onChange={(e) => setEditArea(e.target.value)}>
                          {areas.map((ar) => (
                            <option key={ar._id} value={ar._id}>
                              {ar.name}
                            </option>
                          ))}
                        </select>
                        <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} />
                        <button type="button" onClick={() => saveEdit(a._id)} disabled={savingEdit}>
                          {savingEdit ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" className="btn-secondary" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                      {editError && <p className="error" style={{ marginTop: 10 }}>{editError}</p>}
                    </td>
                  </tr>
                ) : (
                  <tr key={a._id}>
                    <td>{a.atmId}</td>
                    <td>{a.area?.name}</td>
                    <td>{a.location}</td>
                    <td>
                      <button type="button" className="link" onClick={() => startEdit(a)} style={{ marginRight: 16 }}>
                        Edit
                      </button>
                      <button type="button" className="link" onClick={() => deleteAtm(a._id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
