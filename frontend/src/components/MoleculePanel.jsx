import { useEffect, useState } from 'react';

import { getStructure } from '../api';
import Molecule3D, { ATOM_COLORS } from './Molecule3D';

function elementsIn(formula) {
  return [...new Set(formula.match(/[A-Z][a-z]?/g))].filter((symbol) => ATOM_COLORS[symbol]);
}

function MoleculePanel({ drugs, activeId, onSelect }) {
  const [structure, setStructure] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('3d');

  useEffect(() => {
    const controller = new AbortController();
    setStructure(null);
    setError('');
    getStructure(activeId, controller.signal)
      .then(setStructure)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      });
    return () => controller.abort();
  }, [activeId]);

  const show3d = view === '3d' && structure?.molblock;

  return (
    <section className="panel molecule-panel" aria-labelledby="molecule-heading">
      <div className="panel-head">
        <h2 id="molecule-heading">Molecular structure</h2>
        <div className="segmented" role="group" aria-label="View">
          {['2d', '3d'].map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={(option === '3d') === Boolean(show3d)}
              disabled={option === '3d' && structure && !structure.molblock}
              onClick={() => setView(option)}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="chips" role="group" aria-label="Drug to show">
        {drugs.map((drug) => (
          <button
            key={drug.id}
            type="button"
            className="chip"
            aria-pressed={drug.id === activeId}
            onClick={() => onSelect(drug.id)}
          >
            {drug.name}
          </button>
        ))}
      </div>

      <div className="mol-stage">
        {error && <p className="error-text" role="alert">{error}</p>}
        {!error && !structure && <p className="hint">Loading structure…</p>}
        {structure && show3d && (
          <Molecule3D molblock={structure.molblock} label={`3D model of ${structure.name}`} />
        )}
        {structure && !show3d && (
          <img
            className="mol-2d"
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(structure.svg)}`}
            alt={`2D structure of ${structure.name}, ${structure.formula}`}
          />
        )}
      </div>

      {structure && (
        <>
          {show3d && (
            <ul className="atom-key" aria-label="Atom colours">
              {elementsIn(structure.formula).map((symbol) => (
                <li key={symbol}>
                  <span className="atom-dot" style={{ background: ATOM_COLORS[symbol] }} />
                  {symbol}
                </li>
              ))}
            </ul>
          )}
          {structure.note3d && <p className="hint">{structure.note3d}</p>}
          <dl className="facts">
            <div>
              <dt>Formula</dt>
              <dd className="num">{structure.formula}</dd>
            </div>
            <div>
              <dt>Molecular weight</dt>
              <dd className="num">{structure.molecularWeight} g/mol</dd>
            </div>
            <div>
              <dt>Heavy atoms</dt>
              <dd className="num">{structure.heavyAtoms}</dd>
            </div>
            <div>
              <dt>DrugBank</dt>
              <dd>
                <a href={`https://go.drugbank.com/drugs/${structure.drugbankId}`} target="_blank" rel="noreferrer">
                  {structure.drugbankId}
                </a>
              </dd>
            </div>
            {structure.pubchemCid && (
              <div>
                <dt>PubChem CID</dt>
                <dd>
                  <a
                    href={`https://pubchem.ncbi.nlm.nih.gov/compound/${structure.pubchemCid}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {structure.pubchemCid}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          <p className="fine-print">
            Drawn by RDKit from the SMILES string. The 3D shape is one computed low-energy conformer, not an
            experimental structure.
          </p>
        </>
      )}
    </section>
  );
}

export default MoleculePanel;
