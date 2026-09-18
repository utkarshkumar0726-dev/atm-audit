import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AdminNav from '../components/AdminNav';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/audits')
      .then((res) => setAudits(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load audits'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <Topbar>
        <span className="user-chip">
          {user?.name} <span className="role-badge">Admin</span>
        </span>
        <button className="link" onClick={logout}>
          Logout
        </button>
      </Topbar>
      <AdminNav />

      <div className="card wide">
        <h1>All Audits</h1>
        {loading && <p>Loading...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && audits.length === 0 && <p className="empty-state">No audits submitted yet.</p>}

        {audits.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>ATM ID</th>
                <th>Area</th>
                <th>Auditor</th>
                <th>Submitted At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {audits.map((audit) => (
                <tr key={audit._id}>
                  <td>{audit.atmId}</td>
                  <td>{audit.area}</td>
                  <td>{audit.auditor?.name}</td>
                  <td>{new Date(audit.createdAt).toLocaleString()}</td>
                  <td>
                    <Link to={`/admin/audits/${audit._id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
