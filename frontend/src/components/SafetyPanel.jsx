function SafetyPanel() {
  return (
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
  );
}

export default SafetyPanel;
