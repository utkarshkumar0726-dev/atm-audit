import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AdminNav from '../components/AdminNav';

export default function AdminAreas() {
  const { user, logout } = useAuth();
  const [areas, setAreas] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  function loadAreas() {
    api.get('/areas').then((res) => setAreas(res.data));
  }

  useEffect(loadAreas, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/areas', { name });
      setName('');
      loadAreas();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add area');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(area) {
    setEditingId(area._id);
    setEditName(area.name);
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  async function saveEdit(id) {
    setEditError('');
    if (!editName.trim()) {
      setEditError('Name is required');
      return;
    }
    setSavingEdit(true);
    try {
      await api.put(`/areas/${id}`, { name: editName.trim() });
      setEditingId(null);
      loadAreas();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update area');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteArea(id) {
    setError('');
    try {
      await api.delete(`/areas/${id}`);
      loadAreas();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete area');
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
        <h1>Areas / Zones</h1>

        <form onSubmit={handleSubmit} className="inline-form">
          <input placeholder="Area name (e.g. North Zone)" value={name} onChange={(e) => setName(e.target.value)} required />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add Area'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}

        {areas.length === 0 ? (
          <p className="empty-state">No areas added yet.</p>
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {areas.map((a) =>
                  editingId === a._id ? (
                    <tr key={a._id}>
                      <td colSpan={2}>
                        <div className="inline-form" style={{ margin: 0, background: 'transparent', border: 'none', padding: 0 }}>
                          <input value={editName} onChange={(e) => setEditName(e.target.value)} />
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
                      <td>{a.name}</td>
                      <td>
                        <button type="button" className="link" onClick={() => startEdit(a)} style={{ marginRight: 16 }}>
                          Edit
                        </button>
                        <button type="button" className="link" onClick={() => deleteArea(a._id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
