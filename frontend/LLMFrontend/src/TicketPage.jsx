import React, { useEffect, useState } from 'react';

const DEPARTMENTS = [
  "HR", "IT", "Legal", "Finance & Accounting", "Marketing", "Customer Service", "Sales", "Administration",
];

const STATUS_LABELS = {
  open: 'Open',
  accepted: 'Being Resolved',
  resolved: 'Resolved',
  revoked: 'Revoked',
};

export default function TicketPage({ user, onBack, showToast }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('raised'); // 'raised' | 'resolved'
  const [showForm, setShowForm] = useState(false);
  const [viewingTicket, setViewingTicket] = useState(null);

  const [form, setForm] = useState({
    name: `${user.first_name} ${user.last_name}`,
    email: user.email,
    department: '',
    details: '',
    priority: 'medium',
  });
  const [submitting, setSubmitting] = useState(false);

  const loadTickets = () => {
    fetch(`http://localhost:5000/api/tickets?employee_id=${user.id}`)
      .then((res) => res.json())
      .then((data) => setTickets(data.tickets || []))
      .catch(() => showToast('Could not load tickets.', 'error'))
      .finally(() => setLoading(false));
  };

  // poll same cadence as the suspension check elsewhere in the app, so status changes show up without a manual refresh
  useEffect(() => {
    loadTickets();
    const interval = setInterval(loadTickets, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRaise = async (e) => {
    e.preventDefault();
    if (!form.department) {
      showToast('Please select a department.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('http://localhost:5000/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: user.id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to raise ticket.', 'error');
        return;
      }
      showToast('Ticket raised.', 'success');
      setShowForm(false);
      setForm({ ...form, department: '', details: '', priority: 'medium' });
      loadTickets();
    } catch {
      showToast('Could not reach server.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Acknowledgment fires only when the employee actually opens a resolved/revoked ticket — not on every poll — so the admin's message can't disappear before it's read.
  const openTicket = async (ticket) => {
    setViewingTicket(ticket);
    if (ticket.status === 'resolved' || ticket.status === 'revoked') {
      await fetch(`http://localhost:5000/api/tickets/${ticket.id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: user.id }),
      });
    }
  };

  const closeDetail = () => {
    setViewingTicket(null);
    loadTickets(); // refresh so acknowledged ticket drops off the list
  };

  const raised = tickets.filter((t) => t.status === 'open' || t.status === 'accepted');
  const resolved = tickets.filter((t) => t.status === 'resolved' || t.status === 'revoked');
  const visible = tab === 'raised' ? raised : resolved;

  if (viewingTicket) {
    return (
      <div className="employee-detail">
        <button className="admin-login-goback" onClick={closeDetail}>← Back to Tickets</button>
        <div className="employee-detail__profile">
          <h3>Ticket #{viewingTicket.id} · {viewingTicket.department}</h3>
          <p className="employee-detail__meta">
            {STATUS_LABELS[viewingTicket.status]} · Priority: {viewingTicket.priority} ·{' '}
            {new Date(viewingTicket.created_at).toLocaleDateString('en-GB')}
          </p>
          <p>{viewingTicket.details}</p>
          {viewingTicket.admin_message && (
            <>
              <h4>Message from Admin</h4>
              <p>{viewingTicket.admin_message}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dash">
      <button className="admin-login-goback" onClick={onBack}>← Back to Chat</button>

      <div className="admin-dash__tabs">
        <button className={`admin-dash__tab ${tab === 'raised' ? 'admin-dash__tab--active' : ''}`} onClick={() => setTab('raised')}>
          Tickets Raised ({raised.length})
        </button>
        <button className={`admin-dash__tab ${tab === 'resolved' ? 'admin-dash__tab--active' : ''}`} onClick={() => setTab('resolved')}>
          Tickets Resolved ({resolved.length})
        </button>
      </div>

      <button className="sidebar__new-chat" style={{ marginBottom: 16, width: 'auto', padding: '10px 20px' }} onClick={() => setShowForm((s) => !s)}>
        {showForm ? 'Cancel' : '+ Raise Ticket'}
      </button>

      {showForm && (
        <form className="auth-form" onSubmit={handleRaise} style={{ marginBottom: 24 }}>
          <label className="auth-label">Name
            <input className="auth-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="auth-label">Email
            <input type="email" className="auth-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label className="auth-label">Query Related To
            <select className="auth-input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required>
              <option value="" disabled>Select department</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="auth-label">Details
            <textarea className="auth-input" rows={4} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} required />
          </label>
          <label className="auth-label">Priority
            <select className="auth-input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? '...' : 'Submit Ticket'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="admin-dash__loading">Loading tickets…</p>
      ) : visible.length === 0 ? (
        <p className="employee-detail__empty">Nothing here.</p>
      ) : (
        <div className="admin-dash__employee-list">
          {visible.map((t) => (
            <button key={t.id} className="admin-dash__employee-row" onClick={() => openTicket(t)}>
              <span className="admin-dash__employee-name">#{t.id} · {t.department}</span>
              <span className="admin-dash__employee-email">{STATUS_LABELS[t.status]} · {t.priority}</span>
              <span className="admin-dash__employee-since">{new Date(t.created_at).toLocaleDateString('en-GB')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}