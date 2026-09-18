export default function Topbar({ children }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">AA</span>
        <span className="brand-text">
          <span className="brand-name">ATM Audit</span>
          <span className="brand-tagline">Field Compliance</span>
        </span>
      </div>
      <div className="topbar-actions">{children}</div>
    </header>
  );
}
