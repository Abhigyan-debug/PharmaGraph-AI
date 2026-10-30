function AboutCheck() {
  return (
    <aside className="about" aria-label="About this check">
      <section>
        <h2>What you get</h2>
        <ul>
          <li>Every pair of your drugs, checked against documented interactions.</li>
          <li>How serious each one is, worst first, and which source says so.</li>
          <li>Pairs with no record listed separately, never marked as safe.</li>
          <li>A report you can download and show your doctor or pharmacist.</li>
        </ul>
      </section>

      <section>
        <h2>For clinicians</h2>
        <p>
          Each result keeps every source’s own label (DDInter, KEGG, FrenchDB, NDF-RT, OSCAR) and a
          reference ID. When sources disagree, the most severe level is shown.
        </p>
      </section>

      <section>
        <h2>Coverage</h2>
        <p>
          1,706 drugs and 191,402 documented interaction pairs. About 45% of pairs have a severity
          from a source. <a href="#/about/limitations">Limitations</a>
        </p>
      </section>
    </aside>
  );
}

export default AboutCheck;
