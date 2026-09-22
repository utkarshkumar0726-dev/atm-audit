import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(username, password);
      navigate(user.role === 'admin' ? '/admin' : '/auditor');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-center">
      <form className="card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <img
            src="/favicon.svg"
            alt="ATMAudit360 Logo"
            style={{
              width: 60,
              height: 60,
              borderRadius: 15,
              margin: '0 auto 14px',
              boxShadow: '0 6px 20px rgba(2, 132, 199, 0.35)',
              display: 'block',
            }}
          />
          <h1 style={{ fontSize: '1.65rem', margin: '0 0 6px', letterSpacing: '-0.02em', color: '#0f172a' }}>
            ATMAudit<span style={{ color: 'var(--color-primary)' }}>360</span>
          </h1>
          <p className="login-subtitle" style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>
            ATM e-Surveillance & Audit Platform
          </p>
        </div>
        {error && <p className="error">{error}</p>}
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}
