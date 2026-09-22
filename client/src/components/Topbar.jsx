import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function Topbar({ children }) {
  const { user } = useAuth();
  const homeLink = user?.role === 'admin' ? '/admin' : '/auditor';

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function openModal() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    setShowPasswordModal(true);
  }

  function closeModal() {
    setShowPasswordModal(false);
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 4) {
      setError('New password must be at least 4 characters long');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.put('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setSuccess(res.data?.message || 'Password updated successfully!');
      setTimeout(() => {
        closeModal();
      }, 1400);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password');
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
            title="Update Account Password"
          >
            <span>🔑</span>
            <span className="btn-text">Change Password</span>
          </button>
          {children}
        </div>
      </header>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440, padding: 26, borderRadius: 16 }}
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
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#e0f2fe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                  }}
                >
                  🔑
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Change Password</h2>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Update credentials for <strong>{user?.username}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeModal}
                style={{ padding: '4px 10px', borderRadius: 999 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label style={{ margin: 0 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                    Current Password *
                  </span>
                  <input
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    style={{ marginTop: 4, width: '100%', boxSizing: 'border-box' }}
                  />
                </label>

                <label style={{ margin: 0 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                    New Password *
                  </span>
                  <input
                    type="password"
                    placeholder="Enter new password (min 4 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    style={{ marginTop: 4, width: '100%', boxSizing: 'border-box' }}
                  />
                </label>

                <label style={{ margin: 0 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                    Confirm New Password *
                  </span>
                  <input
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    style={{ marginTop: 4, width: '100%', boxSizing: 'border-box' }}
                  />
                </label>
              </div>

              {error && (
                <div
                  style={{
                    marginTop: 14,
                    padding: '8px 12px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 6,
                    color: '#dc2626',
                    fontSize: '0.85rem',
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              {success && (
                <div
                  style={{
                    marginTop: 14,
                    padding: '8px 12px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 6,
                    color: '#16a34a',
                    fontSize: '0.85rem',
                  }}
                >
                  ✓ {success}
                </div>
              )}

              <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={{ minWidth: 140 }}>
                  {submitting ? 'Updating...' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
