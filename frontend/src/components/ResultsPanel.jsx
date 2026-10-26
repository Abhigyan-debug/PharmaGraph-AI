function ResultsPanel({ documented, potential }) {
  return (
    <section className="panel results-panel">
      <div className="results-grid">
        <div className="result-column">
          <div className="results-header">
            <h3>Documented interactions</h3>
          </div>

          {documented.map((item) => (
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

          {potential.map((item) => (
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
  );
}

export default ResultsPanel;
