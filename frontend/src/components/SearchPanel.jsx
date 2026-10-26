function SearchPanel({
  query,
  onQueryChange,
  matches,
  searchError,
  selected,
  maxDrugs,
  onToggle,
  onCheck,
  checking,
  checkError,
}) {
  const isSelected = (drug) => selected.some((item) => item.id === drug.id);
  const full = selected.length >= maxDrugs;
  const canCheck = selected.length >= 2 && !checking;

  return (
    <section className="panel search-panel">
      <div className="section-header">
        <h3>Search medicines</h3>
        <span className="count-pill">
          {selected.length} of {maxDrugs} selected
        </span>
      </div>

      <div className="search-box">
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Generic or brand name, e.g. warfarin or Coumadin"
          aria-label="Search medicines"
        />
      </div>

      {searchError && <p className="error-text" role="alert">{searchError}</p>}
      {!searchError && query.trim().length >= 2 && matches.length === 0 && (
        <p className="muted">No medicine matches “{query.trim()}”.</p>
      )}

      <div className="catalog-grid">
        {matches.map((drug) => (
          <button
            key={drug.id}
            type="button"
            className={`catalog-item ${isSelected(drug) ? 'selected' : ''}`}
            aria-pressed={isSelected(drug)}
            disabled={full && !isSelected(drug)}
            onClick={() => onToggle(drug)}
          >
            {drug.name}
          </button>
        ))}
      </div>

      <div className="selection-box">
        <div className="chip-row">
          {selected.length > 0 ? (
            selected.map((drug) => (
              <button
                key={drug.id}
                type="button"
                className="chip chip-button"
                aria-label={`Remove ${drug.name}`}
                onClick={() => onToggle(drug)}
              >
                {drug.name} ×
              </button>
            ))
          ) : (
            <span className="muted">Pick at least two medicines.</span>
          )}
        </div>

        {checkError && <p className="error-text" role="alert">{checkError}</p>}
        <button type="button" className="primary-action" disabled={!canCheck} onClick={onCheck}>
          {checking ? 'Checking…' : 'Check interactions'}
        </button>
      </div>
    </section>
  );
}

export default SearchPanel;
