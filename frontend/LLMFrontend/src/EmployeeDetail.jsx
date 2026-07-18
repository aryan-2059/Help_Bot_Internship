import React, { useEffect, useState } from 'react';

const SUSPEND_OPTIONS = [
  { key: '1h', label: '1 Hour' },
  { key: '4h', label: '4 Hours' },
  { key: '12h', label: '12 Hours' },
  { key: '1d', label: '1 Day' },
  { key: '1w', label: '1 Week' },
  { key: 'indefinite', label: 'Until I turn it off' },
];

export default function EmployeeDetail({ admin, employeeId, onBack, showToast }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [suspendDuration, setSuspendDuration] = useState('1h');
  const [actionBusy, setActionBusy] = useState(false);

  const loadDetail = () => {
    setLoading(true);
    fetch(`http://localhost:5000/api/admin/employees/${employeeId}?admin_id=${admin.id}&department=${encodeURIComponent(admin.department)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          showToast(data.error, 'error');
          onBack();
          return;
        }
        setDetail(data);
      })
      .catch(() => showToast('Could not load employee details.', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDetail();
  }, [employeeId]);

  const handleSuspend = async () => {
    setActionBusy(true);
    try {
      const res = await fetch(`http://localhost:5000/api/admin/employees/${employeeId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: admin.id, department: admin.department, duration: suspendDuration }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to suspend employee.', 'error');
        return;
      }
      showToast('Employee suspended.', 'success');
      loadDetail(); // refresh suspension status
    } catch {
      showToast('Could not reach server.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleUnsuspend = async () => {
    setActionBusy(true);
    try {
      const res = await fetch(`http://localhost:5000/api/admin/employees/${employeeId}/unsuspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: admin.id, department: admin.department }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to lift suspension.', 'error');
        return;
      }
      showToast('Suspension lifted.', 'success');
      loadDetail();
    } catch {
      showToast('Could not reach server.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDownload = (convId) => {
    // Direct navigation triggers the browser's native download via the Content-Disposition header set on the backend route
    const url = `http://localhost:5000/api/admin/employees/${employeeId}/conversations/${convId}/download?admin_id=${admin.id}&department=${encodeURIComponent(admin.department)}`;
    window.open(url, '_blank');
  };

  if (loading) return <p className="admin-dash__loading">Loading employee details…</p>;
  if (!detail) return null;

  const isSuspended = detail.suspension?.suspended;

  return (
    <div className="employee-detail">
      <button className="admin-login-goback" onClick={onBack}>← Back to Employee List</button>

      <div className="employee-detail__profile">
        <h3>{detail.first_name} {detail.last_name}</h3>
        <p>{detail.email}</p>
        <p className="employee-detail__meta">
          Member since {new Date(detail.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' })}
        </p>
        {isSuspended && (
          <p className="employee-detail__suspended-badge">
            Currently suspended {detail.suspension.until ? `until ${new Date(detail.suspension.until).toLocaleString()}` : '(indefinitely)'}
          </p>
        )}
      </div>

      <div className="employee-detail__suspend-controls">
        {isSuspended ? (
          <button className="employee-detail__action-btn employee-detail__action-btn--unsuspend" onClick={handleUnsuspend} disabled={actionBusy}>
            {actionBusy ? '...' : 'Lift Suspension'}
          </button>
        ) : (
          <>
            <select className="auth-input" value={suspendDuration} onChange={(e) => setSuspendDuration(e.target.value)}>
              {SUSPEND_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <button className="employee-detail__action-btn employee-detail__action-btn--suspend" onClick={handleSuspend} disabled={actionBusy}>
              {actionBusy ? '...' : 'Suspend Employee'}
            </button>
          </>
        )}
      </div>

      <div className="employee-detail__section">
        <h4>Queries Asked (Active Chats) — {detail.active_conversations.length}</h4>
        {detail.active_conversations.length === 0 ? (
          <p className="employee-detail__empty">None yet.</p>
        ) : (
          <ul className="employee-detail__chat-list">
            {detail.active_conversations.map((c) => (
              <li key={c.id}>
                <span>{c.title}</span>
                <span className="employee-detail__chat-date">{new Date(c.created_at).toLocaleDateString()}</span>
                <button onClick={() => handleDownload(c.id)}>Download</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="employee-detail__section">
        <h4>Queries Deleted — {detail.deleted_conversations.length}</h4>
        {detail.deleted_conversations.length === 0 ? (
          <p className="employee-detail__empty">None.</p>
        ) : (
          <ul className="employee-detail__chat-list">
            {detail.deleted_conversations.map((c) => (
              <li key={c.id}>
                <span>{c.title}</span>
                <span className="employee-detail__chat-date">
                  deleted {new Date(c.deleted_at).toLocaleDateString()}
                </span>
                <button onClick={() => handleDownload(c.id)}>Download</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}