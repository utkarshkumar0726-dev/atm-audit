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
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
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
      await api.post('/auth/auditors', {
        name,
        username,
        email,
        phone,
        password,
      });
      setName('');
      setUsername('');
      setEmail('');
      setPhone('');
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
    setEditEmail(auditor.email || '');
    setEditPhone(auditor.phone || '');
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
      const payload = {
        name: editName.trim(),
        username: editUsername.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
      };
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

  const [deletingId, setDeletingId] = useState(null);

  async function handleDelete(auditor) {
    const confirmMsg = `Are you sure you want to delete auditor "${auditor.name}" (@${auditor.username})?\n\nThis will permanently delete their account and release any active ATM assignments.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingId(auditor._id);
    try {
      await api.delete(`/auth/auditors/${auditor._id}`);
      loadAuditors();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete auditor');
    } finally {
      setDeletingId(null);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0 }}>Manage Auditors</h1>
            <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Create and manage auditor accounts, contact information, and login credentials.
            </p>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
            Total Auditors: {auditors.length}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="inline-form">
          <input
            placeholder="Full Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            placeholder="Username *"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Email ID (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="tel"
            placeholder="Phone Number (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password *"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : '+ Add Auditor'}
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
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {auditors.map((a) =>
                editingId === a._id ? (
                  <tr key={a._id}>
                    <td colSpan={7}>
                      <div className="inline-form" style={{ margin: 0, background: 'transparent', border: 'none', padding: 0 }}>
                        <input
                          placeholder="Name *"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          required
                        />
                        <input
                          placeholder="Username *"
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value)}
                          required
                        />
                        <input
                          type="email"
                          placeholder="Email ID"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                        />
                        <input
                          type="tel"
                          placeholder="Phone Number"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
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
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>{a.name}</td>
                    <td>
                      <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: '#0369a1', fontSize: '0.85rem' }}>
                        {a.username}
                      </code>
                    </td>
                    <td>
                      {a.email ? (
                        <a href={`mailto:${a.email}`} style={{ color: '#0284c7', textDecoration: 'none' }}>
                          ✉️ {a.email}
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td>
                      {a.phone ? (
                        <a href={`tel:${a.phone}`} style={{ color: '#059669', textDecoration: 'none' }}>
                          📞 {a.phone}
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className="role-badge" style={{ textTransform: 'capitalize' }}>
                        {a.role}
                      </span>
                    </td>
                    <td style={{ color: '#64748b', fontSize: '0.85rem' }}>
                      {new Date(a.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="link"
                        onClick={() => startEdit(a)}
                        style={{ marginRight: 12 }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => handleDelete(a)}
                        disabled={deletingId === a._id}
                        style={{ color: '#ef4444', fontWeight: 500 }}
                        title={`Delete auditor ${a.name}`}
                      >
                        {deletingId === a._id ? 'Deleting...' : 'Delete'}
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
