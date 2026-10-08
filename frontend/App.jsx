import { useMemo, useState } from 'react';

const medicineCatalog = [
  'Paracetamol',
  'Ibuprofen',
  'Aspirin',
  'Amoxicillin',
  'Metformin',
  'Warfarin',
  'Atorvastatin',
  'Omeprazole',
  'Clopidogrel'
];

const documentedInteractions = [
  {
    pair: 'Aspirin + Warfarin',
    severity: 'Major',
    source: 'DrugBank',
    detail: 'Potential increase in bleeding risk due to antiplatelet and anticoagulant effect.'
  },
  {
    pair: 'Omeprazole + Clopidogrel',
    severity: 'Moderate',
    source: 'Known literature',
    detail: 'Reduced antiplatelet activity may reduce protection from clot formation.'
  }
];

const potentialInteractions = [
  {
    pair: 'Metformin + Atorvastatin',
    probability: 0.82,
    label: 'Medium confidence',
    detail: 'Model predicts possible metabolic overlap; requires clinician review.'
  },
  {
    pair: 'Paracetamol + Omeprazole',
    probability: 0.71,
    label: 'Low confidence',
    detail: 'Graph signal suggests a weak interaction, but no confirmed clinical alert.'
  }
];

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
      <header className="topbar">
        <div>
          <p className="eyebrow">Neural Cyphers T-100</p>
          <h1>PharmGraph AI</h1>
        </div>
        <nav className="nav" aria-label="Main navigation">
          <a href="#">Home</a>
          <a href="#">Results</a>
          <a href="#">About</a>
        </nav>
      </header>

      <main className="content">
        <section className="hero panel">
          <p className="badge">Drug–Drug Interaction Checker</p>
          <h2>Track known and potential medicine interactions.</h2>
          <p>
            Search medicines, compare selected drugs, and review documented warnings and model-based risk signals.
          </p>
        </section>

        <section className="panel search-panel">
          <div className="section-header">
            <h3>Search medicines</h3>
            <span className="count-pill">{selected.length} selected</span>
          </div>

          <div className="search-box">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search medicines..."
              aria-label="Search medicines"
            />
            <button type="button">Search</button>
          </div>

          <div className="catalog-grid">
            {filteredMedicines.map((medicine) => {
              const isSelected = selected.includes(medicine);
              return (
                <button
                  key={medicine}
                  type="button"
                  className={`catalog-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleMedicine(medicine)}
                >
                  {medicine}
                </button>
              );
            })}
          </div>

          <div className="selection-box">
            <div className="chip-row">
              {selected.length > 0 ? (
                selected.map((medicine) => (
                  <button
                    key={medicine}
                    type="button"
                    className="chip chip-button"
                    onClick={() => toggleMedicine(medicine)}
                  >
                    {medicine} ×
                  </button>
                ))
              ) : (
                <span className="muted">No medicine selected yet.</span>
              )}
            </div>

            <button type="button" className="primary-action">
              Check interactions
            </button>
          </div>
        </section>

        <section className="panel results-panel">
          <div className="results-grid">
            <div className="result-column">
              <div className="results-header">
                <h3>Documented interactions</h3>
              </div>

              {documentedInteractions.map((item) => (
                <article key={item.pair} className="interaction-card">
                  <div className="interaction-topline">
                    <strong>{item.pair}</strong>
                    <span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span>
                  </div>
                  <p>{item.detail}</p>
                  <small>{item.source}</small>
                </article>
              ))}
            </div>

            <div className="result-column">
              <div className="results-header">
                <h3>Potential (GNN)</h3>
              </div>

              {potentialInteractions.map((item) => (
                <article key={item.pair} className="interaction-card warning">
                  <div className="interaction-topline">
                    <strong>{item.pair}</strong>
                    <span className="probability-pill">{item.probability * 100}%</span>
                  </div>
                  <p>{item.detail}</p>
                  <small>{item.label}</small>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="panel safety-panel">
          <div className="section-header">
            <h3>Safety and explanation</h3>
          </div>

          <div className="info-grid">
            <div className="info-box warning-box">
              <h4>Clinical disclaimer</h4>
              <p>
                This tool is designed for decision support only and should not replace professional judgment.
              </p>
            </div>

            <div className="info-box">
              <h4>Model interpretation</h4>
              <p>
                GNN-based results are clearly labeled as potential and should be reviewed with source-backed evidence.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
