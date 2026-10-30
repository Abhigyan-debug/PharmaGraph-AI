import { useState } from 'react';

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
  const [active, setActive] = useState(0);
  const isSelected = (drug) => selected.some((item) => item.id === drug.id);
  const full = selected.length >= maxDrugs;
  const open = query.trim().length >= 2;
  const pairs = (selected.length * (selected.length - 1)) / 2;
  const blankLines = Math.max(0, 2 - selected.length);

  const add = (drug) => {
    if (!drug || isSelected(drug) || full) return;
    onToggle(drug);
    onQueryChange('');
    setActive(0);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      add(matches[active]);
    } else if (event.key === 'Escape') {
      onQueryChange('');
    }
  };

  return (
    <section className="sheet" aria-labelledby="rx-heading">
      <div className="rx-row">
        <h2 id="rx-heading" className="rx-label">Rx</h2>

        <div className="rx-body">
          <label className="field-label" htmlFor="drug-search">
            Add a drug
          </label>
          <div className="combo">
            <input
              id="drug-search"
              type="search"
              autoComplete="off"
              role="combobox"
              aria-expanded={open && matches.length > 0}
              aria-controls="drug-options"
              aria-activedescendant={open && matches[active] ? `opt-${matches[active].id}` : undefined}
              value={query}
              disabled={full}
              onChange={(event) => {
                onQueryChange(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={full ? `${maxDrugs} drugs is the limit` : 'Type a drug name, e.g. warfarin or Coumadin'}
            />

            {open && matches.length > 0 && (
              <ul id="drug-options" role="listbox" className="options">
                {matches.map((drug, i) => (
                  <li
                    key={drug.id}
                    id={`opt-${drug.id}`}
                    role="option"
                    aria-selected={i === active}
                    aria-disabled={isSelected(drug)}
                    className={i === active ? 'active' : undefined}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      add(drug);
                    }}
                  >
                    <span className="option-text">
                      <span className="option-name">
                        {drug.name}
                        {drug.matched && <span className="option-match">matched “{drug.matched}”</span>}
                      </span>
                      {drug.summary && <span className="option-summary">{drug.summary}</span>}
                    </span>
                    {isSelected(drug) && <span className="option-note">on the list</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {searchError && <p className="error-text" role="alert">{searchError}</p>}
          {!searchError && open && matches.length === 0 && (
            <p className="hint">No drug matches “{query.trim()}”. Check the spelling or try the generic name.</p>
          )}

          <ol className="rx-lines" aria-label="Drugs to check">
            {selected.map((drug, i) => (
              <li key={drug.id}>
                <span className="line-no">{i + 1}</span>
                <span className="line-name">
                  {drug.name}
                  {/* undefined = added from history or a drug page, where we don't have it; null = MeSH has none */}
                  {drug.summary !== undefined && (
                    <span className="line-summary">{drug.summary ?? 'No plain-language description from MeSH for this drug.'}</span>
                  )}
                </span>
                <button type="button" className="text-button" onClick={() => onToggle(drug)}>
                  Remove<span className="visually-hidden"> {drug.name}</span>
                </button>
              </li>
            ))}
            {Array.from({ length: blankLines }, (_, i) => (
              <li key={`blank-${i}`} className="blank" aria-hidden="true">
                <span className="line-no">{selected.length + i + 1}</span>
                <span className="line-name" />
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="sheet-foot">
        <p className="hint">
          {selected.length < 2
            ? 'Add at least two drugs.'
            : `${selected.length} drugs, ${pairs} ${pairs === 1 ? 'pair' : 'pairs'} to check.`}
        </p>
        {checkError && <p className="error-text" role="alert">{checkError}</p>}
        <button type="button" className="primary" disabled={selected.length < 2 || checking} onClick={onCheck}>
          {checking ? 'Checking…' : selected.length < 2 ? 'Check pairs' : `Check ${pairs} ${pairs === 1 ? 'pair' : 'pairs'}`}
        </button>
      </div>
    </section>
  );
}

export default SearchPanel;
