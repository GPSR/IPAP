export default function Home({ onSelect }) {
  return (
    <div className="home-shell">
      <div className="home-logo-row">
        <img src="/app-logo.svg" alt="" className="home-logo" />
        <div>
          <h1 className="home-title">Election Analytics</h1>
          <p className="home-subtitle">Andhra Pradesh</p>
        </div>
      </div>

      <p className="home-tagline">
        Real ECI-sourced results, browsable from the state down to individual constituencies.
      </p>

      <div className="scope-cards">
        <button className="scope-card" onClick={() => onSelect('state')}>
          <span className="scope-card-label">State</span>
          <span className="scope-card-desc">Seat totals by party, and every seat that flipped between elections</span>
        </button>
        <button className="scope-card" onClick={() => onSelect('district')}>
          <span className="scope-card-label">District</span>
          <span className="scope-card-desc">All constituencies in one district, side by side</span>
        </button>
        <button className="scope-card" onClick={() => onSelect('ac')}>
          <span className="scope-card-label">Constituency</span>
          <span className="scope-card-desc">Full election history for a single seat</span>
        </button>
      </div>
    </div>
  );
}
