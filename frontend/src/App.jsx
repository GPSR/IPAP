import { useState } from 'react';
import Home from './Home';
import StateView from './StateView';
import DistrictView from './DistrictView';
import ConstituencyView from './ConstituencyView';
import './App.css';

export default function App() {
  const [view, setView] = useState('home');
  const [selectedAcFromDistrict, setSelectedAcFromDistrict] = useState(null);

  const goHome = () => {
    setSelectedAcFromDistrict(null);
    setView('home');
  };

  if (view === 'home') return <Home onSelect={setView} />;
  if (view === 'state') return <StateView onBack={goHome} />;
  if (view === 'district') {
    return (
      <DistrictView
        onBack={goHome}
        onOpenAc={(ac) => { setSelectedAcFromDistrict(ac); setView('ac'); }}
      />
    );
  }
  if (view === 'ac') return <ConstituencyView onBack={goHome} initialAc={selectedAcFromDistrict} />;

  return null;
}
