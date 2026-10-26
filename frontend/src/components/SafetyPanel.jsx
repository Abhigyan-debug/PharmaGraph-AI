function SafetyPanel() {
  return (
    <section className="panel safety-panel">
      <div className="section-header">
        <h3>Limitations</h3>
      </div>

      <div className="info-grid">
        <div className="info-box warning-box">
          <h4>Not medical advice</h4>
          <p>
            This is a student decision-support prototype. It does not replace a doctor or pharmacist.
          </p>
        </div>

        <div className="info-box">
          <h4>No record is not “safe”</h4>
          <p>
            Interactions come from the TDC DrugBank DDI set (1,706 drugs). A pair missing from it may
            still interact.
          </p>
        </div>

        <div className="info-box">
          <h4>Severity is partial</h4>
          <p>
            About 45% of documented pairs have a severity from DDInter, KEGG or the Ayvaz et al. merged
            set. The rest show “Severity not reported by our sources”; we never guess one.
          </p>
        </div>

        <div className="info-box">
          <h4>Predictions are unconfirmed</h4>
          <p>
            GNN results, once the model is trained, are shown separately, carry no severity, and have not
            been checked by anyone.
          </p>
        </div>
      </div>
    </section>
  );
}

export default SafetyPanel;
