import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import AuditForm from './pages/AuditForm';
import AuditorDashboard from './pages/AuditorDashboard';
import AuditorAudits from './pages/AuditorAudits';
import AdminDashboard from './pages/AdminDashboard';
import AdminAuditDetail from './pages/AdminAuditDetail';
import AdminAuditors from './pages/AdminAuditors';
import AdminAreas from './pages/AdminAreas';
import AdminAtms from './pages/AdminAtms';
import AdminChecklist from './pages/AdminChecklist';
import AdminAssignments from './pages/AdminAssignments';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/auditor"
            element={
              <ProtectedRoute role="auditor">
                <AuditorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/auditor/audits"
            element={
              <ProtectedRoute role="auditor">
                <AuditorAudits />
              </ProtectedRoute>
            }
          />

          <Route
            path="/audit/new"
            element={
              <ProtectedRoute role="auditor">
                <AuditForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audits/:id"
            element={
              <ProtectedRoute role="admin">
                <AdminAuditDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/auditors"
            element={
              <ProtectedRoute role="admin">
                <AdminAuditors />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/areas"
            element={
              <ProtectedRoute role="admin">
                <AdminAreas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/atms"
            element={
              <ProtectedRoute role="admin">
                <AdminAtms />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/checklist"
            element={
              <ProtectedRoute role="admin">
                <AdminChecklist />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/assignments"
            element={
              <ProtectedRoute role="admin">
                <AdminAssignments />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
