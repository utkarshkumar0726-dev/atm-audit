import { NavLink } from 'react-router-dom';

const LINKS = [
  { to: '/auditor', label: 'My Submitted Audits', icon: '📋', end: true },
  { to: '/audit/new', label: 'Start New Audit', icon: '➕' },
];

export default function AuditorNav() {
  return (
    <nav className="admin-nav" style={{ marginBottom: 20 }}>
      <div className="admin-nav-container">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => (isActive ? 'admin-nav-link active' : 'admin-nav-link')}
          >
            <span className="nav-icon">{link.icon}</span>
            <span className="nav-text">{link.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
