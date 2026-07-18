import React from 'react';

export default function SuspendedOverlay({ adminName }) {
  return (
    <div className="suspended-overlay">
      <div className="suspended-overlay__card">
        <p className="suspended-overlay__title">Chatting services suspended.</p>
        <p className="suspended-overlay__subtitle">
          Contact your admin {adminName || 'your department admin'}.
        </p>
      </div>
    </div>
  );
}