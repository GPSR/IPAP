import { useEffect, useState } from 'react';
import { api } from './api';

const PARTY_COLORS = {
  YSRCP: '#2a78d6', TDP: '#eda100', INC: '#1baf7a', BJP: '#e34948',
  CPI: '#e87ba4', JSP: '#4a3aa7', IND: '#898781', NOTA: '#5f5e5a'
};

export default function DistrictView({ onBack, onOpenAc }) {
  const [districts, setDistricts] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const districtList = await api.listByLevel('DISTRICT');
        districtList.sort((a, b) => a.name.localeCompare(b.name));
        setDistricts(districtList);
        setSelectedDistrict(districtList[0] || null);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedDistrict) return;
    setSummary(null);
    (async () => {
      try {
        setSummary(await api.districtSummary(selectedDistrict.id));
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [selectedDistrict]);

  if (error) return <div className="app-shell"><div className="error-box"><p className="error-title">Couldn't load district summary</p><p className="error-detail">{error}</p></div></div>;

  return (
    <div className="app-shell">
      <button className="back-link" onClick={onBack}>← Home</button>
      <header className="app-header">
        <p className="eyebrow">Election analytics — Andhra Pradesh</p>
        <h1>{selectedDistrict ? selectedDistrict.name : '...'} district</h1>
        <p className="subhead">Every constituency in this district, 2024 result</p>
      </header>

      <div className="district-picker">
        <label htmlFor="district-select-2">District</label>
        <select
          id="district-select-2"
          value={selectedDistrict?.id || ''}
          onChange={e => setSelectedDistrict(districts.find(d => String(d.id) === e.target.value))}
        >
          {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {!summary ? (
        <p className="loading">Loading…</p>
      ) : (
        <div className="district-ac-grid">
          {summary.map(ac => (
            <button key={ac.id} className="district-ac-card" onClick={() => onOpenAc(ac)}>
              <div className="district-ac-name">
                {ac.name}{ac.reservation ? ` (${ac.reservation})` : ''}
              </div>
              {ac.winner2024 ? (
                <div className="district-ac-winner">
                  <span className="party-dot" style={{ background: PARTY_COLORS[ac.winner2024.party] || '#888780' }} />
                  {ac.winner2024.party} — {ac.winner2024.candidate}
                  {ac.winner2024.vote_share_pct !== null && (
                    <span className="district-ac-share"> ({ac.winner2024.vote_share_pct}%)</span>
                  )}
                </div>
              ) : (
                <div className="district-ac-winner district-ac-nodata">No 2024 result seeded</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
