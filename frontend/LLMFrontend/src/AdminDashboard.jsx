import React, { useEffect, useState } from 'react';
import EmployeeDetail from './EmployeeDetail.jsx';
const STATUS_LABELS = {
  open: 'Open',
  accepted: 'Being Resolved',
  resolved: 'Resolved',
  revoked: 'Revoked',
};

export default function AdminDashboard({ admin, onBack, showToast }) {
  const [tab, setTab] = useState('employees'); // 'employees' | 'history'
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

const [tickets, setTickets] = useState([]);
const [loadingTickets, setLoadingTickets] = useState(false);
const [ticketsLoaded, setTicketsLoaded] = useState(false);
const [actingTicketId, setActingTicketId] = useState(null);

const loadTickets = () => {
  setLoadingTickets(true);
  fetch(`http://localhost:5000/api/tickets?admin_id=${admin.id}&department=${encodeURIComponent(admin.department)}`)
    .then((res) => res.json())
    .then((data) => { setTickets(data.tickets || []); setTicketsLoaded(true); })
    .catch(() => showToast('Could not load tickets.', 'error'))
    .finally(() => setLoadingTickets(false));
};

const openTicketsTab = () => {
  setTab('tickets');
  if (!ticketsLoaded) loadTickets();
};

const handleTicketAction = async (ticketId, status) => {
  let admin_message = null;
  if (status === 'resolved' || status === 'revoked') {
    admin_message = window.prompt('Optional message to the employee (leave blank to skip):') || null;
  }
  setActingTicketId(ticketId);
  try {
    const res = await fetch(`http://localhost:5000/api/tickets/${ticketId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_id: admin.id, department: admin.department, status, admin_message }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Action failed.', 'error'); return; }
    showToast('Ticket updated.', 'success');
    loadTickets();
  } catch { showToast('Could not reach server.', 'error'); }
  finally { setActingTicketId(null); }
};

// resolved/revoked tickets shown to admin get dismissed only once admin explicitly clicks "Dismiss" — mirrors the employee's acknowledge flow
const handleDismiss = async (ticketId) => {
  await fetch(`http://localhost:5000/api/tickets/${ticketId}/dismiss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ admin_id: admin.id, department: admin.department }),
  });
  loadTickets();
};

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
        <button className={`admin-dash__tab ${tab === 'tickets' ? 'admin-dash__tab--active' : ''}`} onClick={openTicketsTab}>
          Tickets ({tickets.filter(t => t.status === 'open').length} open)
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
      {tab === 'tickets' && (
        loadingTickets ? <p className="admin-dash__loading">Loading tickets…</p> :
        tickets.length === 0 ? <p className="employee-detail__empty">No tickets.</p> :
        <div className="employee-detail__chat-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tickets.map
            (
              (t) => 
              (
                <div key={t.id} className="admin-dash__history-row" style={{ gridTemplateColumns: '1fr', display: 'block', padding: 14 }}>
                  <p><strong>#{t.id} — {t.employee_name}</strong> ({t.employee_email}) · Priority: {t.priority}</p>
                  <p>{t.details}</p>
                  <p className="employee-detail__meta">Status: {STATUS_LABELS[t.status]} · {new Date(t.created_at).toLocaleDateString('en-GB')}</p>
                  {t.status === 'open' && (
                    <button onClick={() => handleTicketAction(t.id, 'accepted')} disabled={actingTicketId === t.id}>Accept</button>
                  )}
                  {
                    (t.status === 'open' || t.status === 'accepted') && 
                    (
                      <>
                        <button onClick={() => handleTicketAction(t.id, 'resolved')} disabled={actingTicketId === t.id}>Resolve</button>
                        <button onClick={() => handleTicketAction(t.id, 'revoked')} disabled={actingTicketId === t.id}>Revoke</button>
                      </>
                    )
                  }
                  {
                    (t.status === 'resolved' || t.status === 'revoked') && 
                    (
                    <button onClick={() => handleDismiss(t.id)}>Dismiss</button>
                    )
                  }
                </div>
              )
            )
          }
  </div>
)}
    </div>
  );
}