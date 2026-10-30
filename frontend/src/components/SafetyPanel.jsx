function SafetyPanel() {
  return (
    <article className="sheet reading" aria-labelledby="limits-heading">
      <h1 id="limits-heading">Limitations</h1>
      <p className="lead">
        PharmGraph AI is a student decision-support prototype. It does not replace a doctor or
        pharmacist, and nothing here is medical advice.
      </p>

      <h2>No record is not “safe”</h2>
      <p>
        Interactions come from the TDC DrugBank DDI set: 191,402 pairs over 1,706 drugs. A pair that
        is missing from it may still interact, and a drug that isn’t in it can’t be checked.
      </p>

      <h2>Severity is partial</h2>
      <p>
        About 45% of documented pairs (85,756) have a severity from DDInter 2.0, KEGG or the Ayvaz et
        al. merged set. The rest show “Severity not reported”; we never guess a level. When sources
        disagree, the most severe level is shown and every source’s own label is listed under the
        result.
      </p>

      <h2>“Contraindicated” comes only from a source</h2>
      <p>
        A pair is marked contraindicated only when a source labels it that way (for example FrenchDB
        or KEGG “CI”). A major interaction is not automatically a contraindication.
      </p>

      <h2>What your account stores</h2>
      <p>
        Your email, your password as a scrypt hash (never the password itself), your sign-in sessions, and for
        each check the drugs you chose and when. Nothing else about you or your health. Only you can see your
        checks. Delete any of them, or your whole account with everything in it, from the History page.
      </p>

      <h2>Predictions are unconfirmed</h2>
      <p>
        Results from the graph neural network, once it is trained, are shown in their own section,
        carry no severity, and have not been checked by anyone.
      </p>
    </article>
  );
}

export default SafetyPanel;
