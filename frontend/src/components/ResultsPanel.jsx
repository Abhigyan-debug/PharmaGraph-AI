import { useState } from 'react';

import InteractionMap from './InteractionMap';
import MoleculePanel from './MoleculePanel';

const SOURCE_NAMES = { tdc: 'TDC (DrugBank DDI)' };
const ORDER = ['major', 'moderate', 'minor', 'unknown'];
const LABELS = {
  major: 'Major',
  moderate: 'Moderate',
  minor: 'Minor',
  unknown: 'Severity not reported',
};

function SeverityMark({ level }) {
  return (
    <svg className={`mark sev-${level}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {level === 'major' && <circle cx="8" cy="8" r="6.5" fill="currentColor" />}
      {level === 'moderate' && (
        <>
          <path d="M8 1.5a6.5 6.5 0 0 0 0 13z" fill="currentColor" />
          <circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
      {level === 'minor' && <circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {level === 'unknown' && (
        <circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2" />
      )}
    </svg>
  );
}

function downloadReport(checkedAt) {
  const title = document.title;
  document.title = `PharmGraph AI interaction report ${checkedAt.toLocaleDateString('en-CA')}`;
  window.print();
  document.title = title;
}

function rank(item) {
  return (item.contraindicated ? -1 : 0) + ORDER.indexOf(item.severity);
}

function ResultsPanel({ report }) {
  const [activeId, setActiveId] = useState(report?.drugs[0].id);

  if (!report) {
    return (
      <section className="sheet empty">
        <h1>No check yet</h1>
        <p>
          Results appear here after you check a list of drugs. <a href="#/check">Start a check</a>.
        </p>
      </section>
    );
  }

  const names = Object.fromEntries(report.drugs.map((drug) => [drug.id, drug.name]));
  const pairName = ([a, b]) => `${names[a]} + ${names[b]}`;
  const interactions = [...report.interactions].sort((a, b) => rank(a) - rank(b));
  const count = (test) => interactions.filter(test).length;
  const summary = [
    [count((i) => i.contraindicated), 'contraindicated'],
    ...ORDER.map((level) => [count((i) => i.severity === level), LABELS[level].toLowerCase()]),
    [report.pairsWithoutRecord.length, 'no record'],
  ].filter(([n]) => n > 0);

  const checkedAt = report.checkedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <section className="sheet report" aria-labelledby="results-heading">
      <p className="print-only report-brand">PharmGraph AI · Interaction report</p>
      <div className="results-head">
        <div>
          <h1 id="results-heading">Interaction check</h1>
          <p className="checked-list">
            {report.drugs.map((drug) => drug.name).join(', ')}
          </p>
          <p className="checked-at">Checked {checkedAt}</p>
        </div>
        <div className="results-actions">
          {report.saved && <a className="secondary pill" href="#/check">Edit list</a>}
          <button type="button" className="primary pill" onClick={() => downloadReport(report.checkedAt)}>
            Download PDF
          </button>
        </div>
      </div>

      {report.saved === false && (
        <p className="unsaved-note">
          This check isn’t saved. <a href="#/register">Create an account</a> to keep a private history and open drug pages.
        </p>
      )}

      <p className="tally">
        <span className="num">{report.pairsChecked}</span> {report.pairsChecked === 1 ? 'pair' : 'pairs'} checked
        {summary.map(([n, label]) => (
          <span key={label}>
            {' · '}
            <span className="num">{n}</span> {label}
          </span>
        ))}
      </p>

      <p className="advice">
        Don’t stop or change a drug on your own. Share these results with your doctor or pharmacist.
      </p>

      <div className="viz-grid">
        <section className="panel map-panel" aria-labelledby="map-heading">
          <div className="panel-head">
            <h2 id="map-heading">Interaction map</h2>
          </div>
          <InteractionMap
            drugs={report.drugs}
            interactions={interactions}
            pairsWithoutRecord={report.pairsWithoutRecord}
            labels={LABELS}
            activeId={activeId}
            onSelect={setActiveId}
          />
          <ul className="legend" aria-label="Severity key">
            {ORDER.map((level) => (
              <li key={level} className={`sev-${level}`}>
                <SeverityMark level={level} />
                {LABELS[level]}
              </li>
            ))}
            <li className="legend-none">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M1 8h14" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2" />
              </svg>
              No record
            </li>
          </ul>
        </section>
        <MoleculePanel drugs={report.drugs} activeId={activeId} onSelect={setActiveId} />
      </div>

      <h2 className="section-title">Documented interactions</h2>
      {interactions.length === 0 ? (
        <p className="hint">None of the pairs has a documented interaction in our sources.</p>
      ) : (
        <ol className="notes">
          {interactions.map((item) => (
            <li key={item.id} className={`note note-${item.severity}`}>
              <h3 className="note-pair">
                {names[item.pair[0]]}
                <span className="swap" aria-hidden="true">⇄</span>
                <span className="visually-hidden"> and </span>
                {names[item.pair[1]]}
              </h3>
              <dl className="note-rows">
                <div>
                  <dt>Description</dt>
                  <dd>{item.description}</dd>
                </div>
                <div>
                  <dt>Severity</dt>
                  <dd className="note-grade">
                    <span className={`grade sev-${item.severity}`}>
                      <SeverityMark level={item.severity} />
                      {LABELS[item.severity]}
                    </span>
                    {item.contraindicated && <span className="stamp">Contraindicated</span>}
                  </dd>
                </div>
                <div>
                  <dt>Severity source</dt>
                  <dd>{item.severityRaw ?? 'none'}</dd>
                </div>
                <div>
                  <dt>Interaction source</dt>
                  <dd>{SOURCE_NAMES[item.source] ?? item.source}</dd>
                </div>
                <div>
                  <dt>Ref.</dt>
                  <dd className="num">{item.id}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}

      {report.pairsWithoutRecord.length > 0 && (
        <>
          <h2 className="section-title">No record in our sources</h2>
          <p className="warning-line">
            Not finding a record does not mean a combination is safe. Ask a pharmacist or doctor.
          </p>
          <ul className="no-record">
            {report.pairsWithoutRecord.map((pair) => (
              <li key={pair.join('__')}>{pairName(pair)}</li>
            ))}
          </ul>
        </>
      )}

      <div className="predicted" aria-labelledby="predicted-heading">
        <h2 id="predicted-heading" className="section-title">
          Predicted by the model <span className="tag">Unconfirmed</span>
        </h2>
        <p>
          The graph neural network is not trained yet, so there are no predictions. When it is, its
          results will appear here, separate from documented interactions and without a severity.
        </p>
      </div>

      <p className="print-only report-foot">
        Generated by PharmGraph AI on {checkedAt}. Decision support only; it does not replace advice from
        a doctor or pharmacist. A pair with no record may still interact.
      </p>
    </section>
  );
}

export default ResultsPanel;
