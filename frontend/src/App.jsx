import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, LabelList
} from 'recharts';
import { api } from './api';
import './App.css';

const PARTY_COLORS = {
  YSRCP: '#2a78d6', TDP: '#eda100', INC: '#1baf7a', BJP: '#e34948',
  CPI: '#e87ba4', JSP: '#4a3aa7', IND: '#898781', NOTA: '#5f5e5a'
};

const CLASS_COLOR = {
  STRONGHOLD: { bg: 'rgba(47,158,104,0.15)', text: '#5dcaa5' },
  SWING: { bg: 'rgba(232,163,61,0.15)', text: '#eda100' },
  WEAK: { bg: 'rgba(196,69,61,0.15)', text: '#f09595' }
};

// Default landing point — Badvel is where this build started and has full
// real multi-election data, so it's the most informative first view.
const DEFAULT_DISTRICT = 'YSR Kadapa';
const DEFAULT_AC = 'Badvel';

export default function App() {
  const [districts, setDistricts] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [acs, setAcs] = useState([]);
  const [selectedAc, setSelectedAc] = useState(null);
  const [mandals, setMandals] = useState([]);
  const [results, setResults] = useState([]);
  const [trend, setTrend] = useState([]);
  const [demographics, setDemographics] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all 26 districts once, on mount, and default to YSR Kadapa.
  useEffect(() => {
    (async () => {
      try {
        const districtList = await api.listByLevel('DISTRICT');
        districtList.sort((a, b) => a.name.localeCompare(b.name));
        setDistricts(districtList);
        const defaultDistrict = districtList.find(d => d.name === DEFAULT_DISTRICT) || districtList[0];
        setSelectedDistrict(defaultDistrict || null);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  // Load this district's ACs whenever the district selection changes.
  useEffect(() => {
    if (!selectedDistrict) return;
    (async () => {
      try {
        const acList = await api.children(selectedDistrict.id);
        acList.sort((a, b) => Number(a.code) - Number(b.code));
        setAcs(acList);
        const defaultAc = acList.find(a => a.name === DEFAULT_AC) || acList[0];
        setSelectedAc(defaultAc || null);
        setError(null);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [selectedDistrict]);

  // Load everything for the selected AC.
  useEffect(() => {
    if (!selectedAc) return;
    setLoading(true);
    (async () => {
      try {
        const [childrenData, resultsData, trendData, demoData] = await Promise.all([
          api.children(selectedAc.id),
          api.results(selectedAc.id),
          api.trend(selectedAc.id),
          api.demographics(selectedAc.id)
        ]);
        setMandals(childrenData);
        setResults(resultsData);
        setTrend(trendData);
        setDemographics(demoData[0] || null);
        if (resultsData.length) setSelectedYear(resultsData[resultsData.length - 1].year);
        setError(null);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedAc]);

  if (error) {
    return (
      <div className="app-shell">
        <div className="error-box">
          <p className="error-title">Couldn't reach the API</p>
          <p className="error-detail">{error}</p>
          <p className="error-hint">Make sure the backend is running: <code>npm run seed &amp;&amp; npm start</code> in the project root (port 3001).</p>
        </div>
      </div>
    );
  }

  const currentElection = results.find(r => r.year === selectedYear);
  const partiesInTrend = [...new Set(trend.map(t => t.party))].filter(p => p !== 'NOTA' && p !== 'IND' && p !== 'CPI');

  // Reshape trend rows (year, party, share) into one row per election year
  // with a column per party, which is what recharts' <Line> wants.
  const trendByYear = {};
  for (const row of trend) {
    const key = row.year + (row.is_by_election ? '-by' : '');
    if (!trendByYear[key]) trendByYear[key] = { label: row.year + (row.is_by_election ? ' (by)' : ''), year: row.year };
    trendByYear[key][row.party] = row.vote_share_pct;
  }
  const trendData = Object.values(trendByYear);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Election analytics — Andhra Pradesh</p>
          <h1>{selectedAc ? selectedAc.name : '...'} {selectedAc?.reservation ? `(${selectedAc.reservation})` : ''}</h1>
          <p className="subhead">
            {selectedDistrict?.name} district, Andhra Pradesh — live from Postgres/SQLite via REST API
          </p>
        </div>
      </header>

      <div className="district-picker">
        <label htmlFor="district-select">District</label>
        <select
          id="district-select"
          value={selectedDistrict?.id || ''}
          onChange={e => {
            const d = districts.find(d => String(d.id) === e.target.value);
            setSelectedDistrict(d);
          }}
        >
          {districts.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div className="ac-switch">
        {acs.map(ac => (
          <button
            key={ac.id}
            className={ac.id === selectedAc?.id ? 'tab tab-active' : 'tab'}
            onClick={() => setSelectedAc(ac)}
          >
            {ac.name}{ac.reservation ? ` (${ac.reservation})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="loading">Loading…</p>
      ) : results.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No election results yet for {selectedAc?.name}</p>
          <p className="empty-detail">
            This constituency exists in the hierarchy (district, PC, reservation status are all real),
            but multi-election result data hasn't been sourced and seeded for it yet — that work is
            currently only done for Badvel and Kadapa. Switch to one of those to see full results.
          </p>
        </div>
      ) : (
        <>
          <div className="election-tabs">
            {results.map(r => (
              <button
                key={r.year + (r.is_by_election ? 'by' : '')}
                className={r.year === selectedYear ? 'tab tab-active' : 'tab'}
                onClick={() => setSelectedYear(r.year)}
              >
                {r.year}{r.is_by_election ? ' by-poll' : ''}
              </button>
            ))}
          </div>

          {currentElection && (
            <>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <p className="kpi-label">Turnout</p>
                  <p className="kpi-value">{currentElection.turnout?.turnout_pct ?? '—'}%</p>
                  <p className="kpi-sub">{Number(currentElection.turnout?.votes_polled ?? 0).toLocaleString()} votes polled</p>
                </div>
                <div className="kpi-card">
                  <p className="kpi-label">Winner</p>
                  <p className="kpi-value">{currentElection.candidates[0].party}</p>
                  <p className="kpi-sub">{currentElection.candidates[0].candidate}</p>
                </div>
                <div className="kpi-card">
                  <p className="kpi-label">Margin</p>
                  <p className="kpi-value">{currentElection.classification?.margin_pct ?? '—'}%</p>
                  <p className="kpi-sub">of total votes</p>
                </div>
                <div className="kpi-card">
                  <p className="kpi-label">Classification</p>
                  <span
                    className="badge"
                    style={{
                      background: CLASS_COLOR[currentElection.classification?.classification]?.bg,
                      color: CLASS_COLOR[currentElection.classification?.classification]?.text
                    }}
                  >
                    {currentElection.classification?.classification ?? '—'}
                  </span>
                </div>
              </div>

              <section className="chart-section">
                <h2>Candidate results — {selectedYear}</h2>
                {currentElection.candidates.every(c => c.vote_share_pct === null) ? (
                  <div className="winner-only-note">
                    <p>
                      <strong>{currentElection.candidates[0].candidate}</strong> ({currentElection.candidates[0].party}) won this seat,
                      but full candidate-level results (vote counts, margin, runner-up) haven't been sourced for this
                      constituency yet — only the winner and party are confirmed real data.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(120, currentElection.candidates.length * 40)}>
                    <BarChart data={currentElection.candidates} layout="vertical" margin={{ left: 24, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2a" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} stroke="#898781" fontSize={12} />
                      <YAxis type="category" dataKey="candidate" width={200} stroke="#898781" fontSize={12} />
                      <Tooltip
                        contentStyle={{ background: '#171d26', border: '1px solid #2c2c2a' }}
                        formatter={(v, n, p) => [`${v}%`, p.payload.party]}
                      />
                      <Bar dataKey="vote_share_pct" radius={[0, 4, 4, 0]}>
                        {currentElection.candidates.map((c, i) => (
                          <Cell key={i} fill={PARTY_COLORS[c.party] || '#888780'} />
                        ))}
                        <LabelList dataKey="vote_share_pct" position="right" formatter={v => `${v}%`} fill="#c3c2b7" fontSize={12} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </section>
            </>
          )}

          <section className="chart-section">
            <h2>Vote share trend — all elections on record</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData} margin={{ left: 8, right: 24, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2a" />
                <XAxis dataKey="label" stroke="#898781" fontSize={12} />
                <YAxis domain={[0, 90]} tickFormatter={v => `${v}%`} stroke="#898781" fontSize={12} />
                <Tooltip contentStyle={{ background: '#171d26', border: '1px solid #2c2c2a' }} />
                {partiesInTrend.map(p => (
                  <Line key={p} type="monotone" dataKey={p} stroke={PARTY_COLORS[p] || '#888780'} strokeWidth={2} dot={{ r: 4 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className="legend">
              {partiesInTrend.map(p => (
                <span key={p} className="legend-item">
                  <span className="legend-dot" style={{ background: PARTY_COLORS[p] }} />
                  {p}
                </span>
              ))}
            </div>
          </section>

          <section className="chart-section">
            <h2>Constituency composition — {mandals.length} mandal{mandals.length !== 1 ? 's' : ''}</h2>
            <div className="mandal-list">
              {mandals.map(m => <span key={m.id} className="mandal-chip">{m.name}</span>)}
            </div>
            {demographics && (
              <p className="demo-note">
                Census 2011: {demographics.population?.toLocaleString()} population,{' '}
                {demographics.rural_pct}% rural, {demographics.sc_pct}% SC, {demographics.st_pct}% ST
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
