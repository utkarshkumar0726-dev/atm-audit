export default function Topbar({ children }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', fontWeight: 800, fontSize: '0.85rem' }}>
          360
        </span>
        <span className="brand-text">
          <span className="brand-name">
            ATMAudit<span style={{ color: 'var(--color-primary)' }}>360</span>
          </span>
          <span className="brand-tagline">e-Surveillance & Compliance</span>
        </span>
      </div>
      <div className="topbar-actions">{children}</div>
    </header>
  );
}
