import { NavLink } from 'react-router-dom';

const LINKS = [
  { to: '/admin', label: 'Audits', end: true },
  { to: '/admin/auditors', label: 'Auditors' },
  { to: '/admin/areas', label: 'Areas' },
  { to: '/admin/atms', label: 'ATMs' },
  { to: '/admin/checklist', label: 'Checklist' },
  { to: '/admin/assignments', label: 'Assignments' },
];

export default function AdminNav() {
  return (
    <nav className="admin-nav">
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
