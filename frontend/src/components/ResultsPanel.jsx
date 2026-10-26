const SOURCE_NAMES = { tdc: 'TDC (DrugBank DDI)' };

function ResultsPanel({ report }) {
  if (!report) {
    return (
      <section className="panel">
        <p className="muted">
          No check yet. <a href="#/">Pick two or more medicines</a> first.
        </p>
      </section>
    );
  }

  const names = Object.fromEntries(report.drugs.map((drug) => [drug.id, drug.name]));
  const pairName = ([a, b]) => `${names[a]} + ${names[b]}`;

  return (
    <section className="panel results-panel">
      <p className="muted">
        {report.drugs.map((drug) => drug.name).join(', ')}: {report.pairsChecked}{' '}
        {report.pairsChecked === 1 ? 'pair' : 'pairs'} checked.
      </p>

      <div className="results-grid">
        <div className="result-column">
          <div className="results-header">
            <h3>Documented interactions</h3>
          </div>

          {report.interactions.length === 0 && <p className="muted">None found in our sources.</p>}
          {report.interactions.map((item) => (
            <article key={item.id} className="interaction-card">
              <div className="interaction-topline">
                <strong>{pairName(item.pair)}</strong>
                <span className="pill-row">
                  {item.contraindicated && <span className="severity contraindicated">Contraindicated</span>}
                  <span className={`severity ${item.severity}`}>
                    {item.severity === 'unknown' ? 'Severity not reported by our sources' : item.severity}
                  </span>
                </span>
              </div>
              <p>{item.description}</p>
              <small>
                Interaction: {SOURCE_NAMES[item.source] ?? item.source}
                {item.severityRaw && ` · Severity: ${item.severityRaw}`}
              </small>
            </article>
          ))}

          {report.pairsWithoutRecord.length > 0 && (
            <div className="info-box">
              <h4>No record found</h4>
              <ul className="plain-list">
                {report.pairsWithoutRecord.map((pair) => (
                  <li key={pair.join('__')}>{pairName(pair)}</li>
                ))}
              </ul>
              <p className="muted">
                Our sources have no record for these pairs. That does not mean the combination is safe.
              </p>
            </div>
          )}
        </div>

        <div className="result-column">
          <div className="results-header">
            <h3>Potential (GNN)</h3>
          </div>
          <div className="interaction-card warning">
            <p>The prediction model is not trained yet, so there are no predicted interactions to show.</p>
            <small>Predictions will appear here, kept apart from documented interactions.</small>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ResultsPanel;
