import { NavLink } from 'react-router-dom';

const LINKS = [
  { to: '/auditor', label: '📋 My Audits', end: true },
  { to: '/audit/new', label: '➕ Start New Audit' },
];

export default function AuditorNav() {
  return (
    <nav className="admin-nav" style={{ marginBottom: 20 }}>
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => (isActive ? 'admin-nav-link active' : 'admin-nav-link')}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
