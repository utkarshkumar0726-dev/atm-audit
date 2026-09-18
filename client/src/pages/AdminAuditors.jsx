import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AdminNav from '../components/AdminNav';

export default function AdminAuditors() {
  const { user, logout } = useAuth();
  const [auditors, setAuditors] = useState([]);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  function loadAuditors() {
    api.get('/auth/auditors').then((res) => setAuditors(res.data));
  }

  useEffect(loadAuditors, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/auditors', { name, username, password });
      setName('');
      setUsername('');
      setPassword('');
      loadAuditors();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create auditor');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(auditor) {
    setEditingId(auditor._id);
    setEditName(auditor.name);
    setEditUsername(auditor.username);
    setEditPassword('');
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  async function saveEdit(id) {
    setEditError('');
    if (!editName.trim() || !editUsername.trim()) {
      setEditError('Name and username are required');
      return;
    }
    setSavingEdit(true);
    try {
      const payload = { name: editName.trim(), username: editUsername.trim() };
      if (editPassword) payload.password = editPassword;
      await api.put(`/auth/auditors/${id}`, payload);
      setEditingId(null);
      loadAuditors();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update auditor');
    } finally {
      setSavingEdit(false);
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
        <h1>Manage Auditors</h1>

        <form onSubmit={handleSubmit} className="inline-form">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Add Auditor'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}

        {auditors.length === 0 ? (
          <p className="empty-state">No auditors added yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {auditors.map((a) =>
                editingId === a._id ? (
                  <tr key={a._id}>
                    <td colSpan={5}>
                      <div className="inline-form" style={{ margin: 0, background: 'transparent', border: 'none', padding: 0 }}>
                        <input
                          placeholder="Name"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                        <input
                          placeholder="Username"
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value)}
                        />
                        <input
                          type="password"
                          placeholder="New password (optional)"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                        />
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
                    <td>{a.username}</td>
                    <td>{a.role}</td>
                    <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button type="button" className="link" onClick={() => startEdit(a)}>
                        Edit
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
