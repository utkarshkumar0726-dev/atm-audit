import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Topbar({ children }) {
  const { user } = useAuth();
  const homeLink = user?.role === 'admin' ? '/admin' : '/auditor';

  return (
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
      <div className="topbar-actions">{children}</div>
    </header>
  );
}
