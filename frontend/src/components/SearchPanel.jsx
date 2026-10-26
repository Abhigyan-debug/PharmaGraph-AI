function SearchPanel({ query, onQueryChange, medicines, selected, onToggle }) {
  return (
    <section className="panel search-panel">
      <div className="section-header">
        <h3>Search medicines</h3>
        <span className="count-pill">{selected.length} selected</span>
      </div>

      <div className="search-box">
        <input
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search medicines..."
          aria-label="Search medicines"
        />
        <button type="button">Search</button>
      </div>

      <div className="catalog-grid">
        {medicines.map((medicine) => {
          const isSelected = selected.includes(medicine);
          return (
            <button
              key={medicine}
              type="button"
              className={`catalog-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onToggle(medicine)}
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
                onClick={() => onToggle(medicine)}
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
  );
}

export default SearchPanel;
