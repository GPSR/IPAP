import { useEffect, useState } from 'react';
import { api } from './api';

const PARTY_COLORS = {
  YSRCP: '#2a78d6', TDP: '#eda100', INC: '#1baf7a', BJP: '#e34948',
  CPI: '#e87ba4', JSP: '#4a3aa7', IND: '#898781', NOTA: '#5f5e5a'
};

export default function StateView({ onBack }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setSummary(await api.stateSummary());
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  if (error) return <div className="app-shell"><div className="error-box"><p className="error-title">Couldn't load state summary</p><p className="error-detail">{error}</p></div></div>;
  if (!summary) return <div className="app-shell"><p className="loading">Loading…</p></div>;

  const totalSeats = summary.seatsByParty.reduce((s, p) => s + Number(p.seats), 0);

  return (
    <div className="app-shell">
      <button className="back-link" onClick={onBack}>← Home</button>
      <header className="app-header">
        <p className="eyebrow">Election analytics — Andhra Pradesh</p>
        <h1>State overview</h1>
        <p className="subhead">{summary.totalDistricts} districts, {summary.totalAcs} constituencies — 2024 result, compared against 2019</p>
      </header>

      <section className="chart-section">
        <h2>Seats won by party — 2024 ({totalSeats} of {summary.totalAcs} seats with confirmed winners)</h2>
        <div className="seat-bar">
          {summary.seatsByParty.map(p => (
            <div
              key={p.party}
              className="seat-bar-segment"
              style={{ width: `${(p.seats / totalSeats) * 100}%`, background: p.color_hex || PARTY_COLORS[p.party] || '#888780' }}
              title={`${p.party}: ${p.seats} seats`}
            />
          ))}
        </div>
        <div className="seat-legend">
          {summary.seatsByParty.map(p => (
            <span key={p.party} className="legend-item">
              <span className="legend-dot" style={{ background: p.color_hex || PARTY_COLORS[p.party] }} />
              {p.party}: <strong>{p.seats}</strong>
            </span>
          ))}
        </div>
      </section>

      <section className="chart-section">
        <h2>Seats that changed party, 2019 → 2024 ({summary.flippedCount} of {summary.totalAcs})</h2>
        <div className="flip-table">
          {summary.flips.map(f => (
            <div key={f.code} className="flip-row">
              <span className="flip-name">{f.name}</span>
              <span className="flip-district">{f.district}</span>
              <span className="flip-parties">
                <span style={{ color: PARTY_COLORS[f.party_2019] || '#c3c2b7' }}>{f.party_2019}</span>
                {' → '}
                <span style={{ color: PARTY_COLORS[f.party_2024] || '#c3c2b7' }}>{f.party_2024}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
