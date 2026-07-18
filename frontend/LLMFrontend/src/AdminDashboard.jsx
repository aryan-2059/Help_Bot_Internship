import React, { useEffect, useState } from 'react';
import EmployeeDetail from './EmployeeDetail.jsx';

export default function AdminDashboard({ admin, onBack, showToast }) {
  const [tab, setTab] = useState('employees'); // 'employees' | 'history'
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    fetch(`http://localhost:5000/api/admin/employees?admin_id=${admin.id}&department=${encodeURIComponent(admin.department)}`)
      .then((res) => res.json())
      .then((data) => setEmployees(data.employees || []))
      .catch(() => showToast('Could not load employee list.', 'error'))
      .finally(() => setLoadingEmployees(false));
  }, []);

  // Lazy-load login history only when that tab is first opened, no point fetching it up front if the admin never clicks the tab.
  const openHistoryTab = () => {
    setTab('history');
    if (historyLoaded) return;
    setLoadingHistory(true);
    fetch(`http://localhost:5000/api/admin/login-history?admin_id=${admin.id}&department=${encodeURIComponent(admin.department)}`)
      .then((res) => res.json())
      .then((data) => {
        setHistory(data.history || []);
        setHistoryLoaded(true);
      })
      .catch(() => showToast('Could not load login history.', 'error'))
      .finally(() => setLoadingHistory(false));
  };

  if (selectedEmployeeId) {
    return (
      <EmployeeDetail
        admin={admin}
        employeeId={selectedEmployeeId}
        onBack={() => setSelectedEmployeeId(null)}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="admin-dash">
      <button className="admin-login-goback" onClick={onBack}>← Back to Chat</button>

      <div className="admin-dash__profile">
        <h3>{admin.first_name} {admin.last_name}</h3>
        <p>{admin.email}</p>
        <p className="employee-detail__meta">
          {admin.department} Admin · Member since {admin.created_at ? new Date(admin.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' }) : '—'}
        </p>
      </div>

      <div className="admin-dash__tabs">
        <button
          className={`admin-dash__tab ${tab === 'employees' ? 'admin-dash__tab--active' : ''}`}
          onClick={() => setTab('employees')}
        >
          Employees ({employees.length})
        </button>
        <button
          className={`admin-dash__tab ${tab === 'history' ? 'admin-dash__tab--active' : ''}`}
          onClick={openHistoryTab}
        >
          Login History
        </button>
      </div>

      {tab === 'employees' && (
        <div className="admin-dash__employee-list">
          {loadingEmployees ? (
            <p className="admin-dash__loading">Loading employees…</p>
          ) : employees.length === 0 ? (
            <p className="employee-detail__empty">No employees in {admin.department} yet.</p>
          ) : (
            employees.map((emp) => (
              <button
                key={emp.id}
                className="admin-dash__employee-row"
                onClick={() => setSelectedEmployeeId(emp.id)}
              >
                <span className="admin-dash__employee-name">{emp.first_name} {emp.last_name}</span>
                <span className="admin-dash__employee-email">{emp.email}</span>
                <span className="admin-dash__employee-since">
                  since {new Date(emp.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="admin-dash__history-list">
          {loadingHistory ? (
            <p className="admin-dash__loading">Loading login history…</p>
          ) : history.length === 0 ? (
            <p className="employee-detail__empty">No login history yet.</p>
          ) : (
            history.map((h, i) => (
              <div key={i} className="admin-dash__history-row">
                <span className={`admin-dash__history-badge ${h.is_new_user ? 'admin-dash__history-badge--new' : ''}`}>
                  {h.is_new_user ? 'NEW' : 'EXISTING'}
                </span>
                <span>{h.first_name} {h.last_name}</span>
                <span className="admin-dash__employee-email">{h.email}</span>
                <span>{h.event_type}</span>
                <span className="admin-dash__history-time">{new Date(h.event_time).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}