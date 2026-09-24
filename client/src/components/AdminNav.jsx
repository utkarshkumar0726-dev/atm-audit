import { NavLink } from 'react-router-dom';

const LINKS = [
  { to: '/admin', label: 'Audits', icon: '📊', end: true },
  { to: '/admin/assignments', label: 'Assignments', icon: '🎯' },
  { to: '/admin/atms', label: 'ATMs', icon: '🏦' },
  { to: '/admin/auditors', label: 'Auditors', icon: '👥' },
  { to: '/admin/areas', label: 'Zones & Areas', icon: '🗺️' },
  { to: '/admin/checklist', label: 'Checklist', icon: '📋' },
  { to: '/admin/logs', label: 'Logs & Activities', icon: '📑' },
];

export default function AdminNav() {
  return (
    <nav className="admin-nav">
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
