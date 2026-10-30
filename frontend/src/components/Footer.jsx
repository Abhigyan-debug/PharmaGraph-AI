const COLUMNS = [
  ['Product', [['#/check', 'Interaction checker'], ['#/drugs', 'Drug library'], ['#/history', 'Your checks']]],
  ['Research', [['#/research/graph', 'Knowledge graph'], ['#/research/mapping', 'Identifier mapping'], ['#/research/sources', 'Data sources'], ['#/research/pipeline', 'Pipeline']]],
  ['Trust', [['#/about/limitations', 'Limitations'], ['#/about/limitations', 'What we store'], ['#/register', 'Create an account']]],
];

const EXPLORE = [
  ['#/drugs', 'Drug library'],
  ['#/research/graph', 'Graph'],
  ['#/research/mapping', 'Mapping'],
  ['#/research/sources', 'Sources'],
  ['#/check', 'Checker'],
];

function Footer() {
  return (
    <footer className="site-footer band-deep">
      <div className="footer-inner">
        <div className="footer-brand">
          <a className="brand" href="#/">
            <img src="/brand/logo-512.webp" alt="" width="36" height="36" className="brand-mark" />
            <span className="brand-name">PharmGraph <b>AI</b></span>
          </a>
          <p>Knowledge. Safety. Transparency. Every documented interaction shown with the source that recorded it.</p>
          <a className="primary small pill" href="#/check">Open the checker</a>
        </div>
        {COLUMNS.map(([title, links]) => (
          <div key={title} className="footer-col">
            <p className="footer-title">{title}</p>
            {links.map(([href, label]) => <a key={label} href={href}>{label}</a>)}
          </div>
        ))}
      </div>
      <div className="footer-explore">
        <p className="footer-title">Explore</p>
        <div className="chip-row">
          {EXPLORE.map(([href, label]) => <a key={label} href={href} className="chip-link">{label}</a>)}
        </div>
      </div>
      <div className="footer-legal">
        <p>Decision support only; it does not replace advice from a doctor or pharmacist.</p>
        <p>Data: TDC (DrugBank DDI), DDInter 2.0, KEGG, Ayvaz et al. 2015, PubChem. Structures: RDKit.</p>
      </div>
    </footer>
  );
}

export default Footer;
