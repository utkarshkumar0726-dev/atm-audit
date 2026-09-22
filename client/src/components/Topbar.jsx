import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function Topbar({ children }) {
  const { user, updateUser } = useAuth();
  const homeLink = user?.role === 'admin' ? '/admin' : '/auditor';

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function openModal() {
    setName(user?.name || '');
    setUsername(user?.username || '');
    setShowPasswordFields(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
  }

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name.trim()) {
      setError('Full Name is required');
      return;
    }
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    if (showPasswordFields || newPassword || currentPassword || confirmPassword) {
      if (!currentPassword) {
        setError('Current password is required to change your password');
        return;
      }
      if (newPassword.length < 4) {
        setError('New password must be at least 4 characters long');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('New passwords do not match');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        username: username.trim(),
      };
      if (showPasswordFields && newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const res = await api.put('/auth/profile', payload);
      if (res.data?.user && res.data?.token) {
        updateUser(res.data.user, res.data.token);
      }
      setSuccess(res.data?.message || 'Account details updated successfully!');
      setTimeout(() => {
        closeModal();
      }, 1300);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update account details');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <Link to={homeLink} className="brand-link">
          <div className="brand">
            <div className="brand-logo-wrapper">
              <img
                src="/favicon.svg"
                alt="ATMAudit360 Logo"
                className="brand-logo-img"
              />
            </div>
            <div className="brand-text">
              <span className="brand-name">
                ATMAudit<span className="brand-accent">360</span>
              </span>
              <span className="brand-tagline">
                <span className="live-dot" />
                e-Surveillance & Compliance
              </span>
            </div>
          </div>
        </Link>
        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-btn-security"
            onClick={openModal}
            title="Manage Profile Details and Password"
          >
            <span>⚙️</span>
            <span className="btn-text">Account Settings</span>
          </button>
          {children}
        </div>
      </header>

      {/* Account Settings & Profile Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480, padding: 26, borderRadius: 16, maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                    boxShadow: '0 2px 6px rgba(14, 165, 233, 0.15)',
                  }}
                >
                  👤
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: 700 }}>
                    Account Settings
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Update details & credentials for <strong style={{ color: '#0284c7' }}>{user?.username}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeModal}
                style={{ padding: '4px 10px', borderRadius: 999, fontSize: '0.9rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProfileSubmit}>
              {/* Profile Details Section */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>
                    Profile Details
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: user?.role === 'admin' ? '#e0f2fe' : '#f1f5f9',
                      color: user?.role === 'admin' ? '#0284c7' : '#475569',
                      padding: '2px 8px',
                      borderRadius: 6,
                      textTransform: 'uppercase',
                    }}
                  >
                    {user?.role}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={{ margin: 0 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                      Full Name *
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. Admin User"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      style={{ marginTop: 4, width: '100%', boxSizing: 'border-box' }}
                    />
                  </label>

                  <label style={{ margin: 0 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                      Username *
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      style={{ marginTop: 4, width: '100%', boxSizing: 'border-box' }}
                    />
                    <small style={{ color: '#64748b', fontSize: '0.74rem', marginTop: 2, display: 'block' }}>
                      Used to login to ATMAudit360
                    </small>
                  </label>
                </div>
              </div>

              {/* Password Section */}
              <div
                style={{
                  background: showPasswordFields ? '#f8fafc' : '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 16,
                  transition: 'all 0.2s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => setShowPasswordFields(!showPasswordFields)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1rem' }}>🔑</span>
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#1e293b' }}>
                        Change Password
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        {showPasswordFields ? 'Enter current & new password' : 'Click to change account password'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{
                      background: showPasswordFields ? '#e2e8f0' : '#f1f5f9',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: '#334155',
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPasswordFields(!showPasswordFields);
                    }}
                  >
                    {showPasswordFields ? 'Hide' : 'Update Password'}
                  </button>
                </div>

                {showPasswordFields && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                    <label style={{ margin: 0 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                        Current Password *
                      </span>
                      <input
                        type="password"
                        placeholder="Enter current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required={showPasswordFields}
                        style={{ marginTop: 4, width: '100%', boxSizing: 'border-box' }}
                      />
                    </label>

                    <label style={{ margin: 0 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                        New Password *
                      </span>
                      <input
                        type="password"
                        placeholder="Min 4 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required={showPasswordFields}
                        style={{ marginTop: 4, width: '100%', boxSizing: 'border-box' }}
                      />
                    </label>

                    <label style={{ margin: 0 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                        Confirm New Password *
                      </span>
                      <input
                        type="password"
                        placeholder="Re-enter new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required={showPasswordFields}
                        style={{ marginTop: 4, width: '100%', boxSizing: 'border-box' }}
                      />
                    </label>
                  </div>
                )}
              </div>

              {error && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: '9px 12px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    color: '#dc2626',
                    fontSize: '0.84rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: '9px 12px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 8,
                    color: '#16a34a',
                    fontSize: '0.84rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>✓</span>
                  <span>{success}</span>
                </div>
              )}

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={{ minWidth: 140 }}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
