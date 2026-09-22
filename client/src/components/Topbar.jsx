export default function Topbar({ children }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img
          src="/favicon.svg"
          alt="ATMAudit360"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
          }}
        />
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
