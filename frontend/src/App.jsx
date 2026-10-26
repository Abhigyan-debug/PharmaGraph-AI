import { useMemo, useState } from 'react';

import Header from './components/Header';
import Hero from './components/Hero';
import ResultsPanel from './components/ResultsPanel';
import SafetyPanel from './components/SafetyPanel';
import SearchPanel from './components/SearchPanel';
import { documentedInteractions, medicineCatalog, potentialInteractions } from './data/sampleData';

function App() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(['Paracetamol', 'Ibuprofen']);

  const filteredMedicines = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return medicineCatalog;
    return medicineCatalog.filter((medicine) => medicine.toLowerCase().includes(normalizedQuery));
  }, [query]);

  const toggleMedicine = (medicine) => {
    setSelected((current) => {
      if (current.includes(medicine)) {
        return current.filter((item) => item !== medicine);
      }
      return [...current, medicine];
    });
  };

  return (
    <div className="app-shell">
      <Header />

      <main className="content">
        <Hero />
        <SearchPanel
          query={query}
          onQueryChange={setQuery}
          medicines={filteredMedicines}
          selected={selected}
          onToggle={toggleMedicine}
        />
        <ResultsPanel documented={documentedInteractions} potential={potentialInteractions} />
        <SafetyPanel />
      </main>
    </div>
  );
}

export default App;
