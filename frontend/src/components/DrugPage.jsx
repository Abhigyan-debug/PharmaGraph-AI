import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { getDrug, getStructure } from '../api';
import { svgSrc } from './DrugList';
import Icon from './Icon';
import Molecule3D, { ATOM_COLORS } from './Molecule3D';

const ORDER = ['major', 'moderate', 'minor', 'unknown'];
const LABELS = { major: 'Major', moderate: 'Moderate', minor: 'Minor', unknown: 'Not graded' };
const NETWORK_SIZE = 24;
const NETWORK_QUOTA = { major: 8, moderate: 8, minor: 4, unknown: 4 };
const LIST_STEP = 40;

// No DDInter link: its URL format couldn't be verified (the site didn't respond).
const ID_SOURCES = [
  ['drugbank', 'DrugBank', (id) => `https://go.drugbank.com/drugs/${id}`],
  ['pubchem', 'PubChem CID', (id) => `https://pubchem.ncbi.nlm.nih.gov/compound/${id}`],
  ['kegg', 'KEGG DRUG', (id) => `https://www.kegg.jp/entry/${id}`],
  ['ddinter', 'DDInter', null],
];

export function Formula({ value }) {
  return <span className="formula">{value.split(/(\d+)/).map((part, i) => (/^\d+$/.test(part) ? <sub key={i}>{part}</sub> : part))}</span>;
}

function CopyText({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(text).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  });
  return (
    <span className="copy-text">
      <code>{text}</code>
      <button type="button" className="icon-button tiny" onClick={copy} aria-label={`Copy ${label}`}>
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
    </span>
  );
}

// Up to 24 partners, a few from each severity level so the picture isn't all one colour.
function networkSample(partners) {
  const picked = ORDER.flatMap((level) => partners.filter((p) => p.severity === level).slice(0, NETWORK_QUOTA[level]));
  const rest = partners.filter((p) => !picked.includes(p));
  return [...picked, ...rest].slice(0, NETWORK_SIZE);
}

function InteractionNetwork({ drug }) {
  const partners = networkSample(drug.partners);
  const size = 440;
  const centre = size / 2;
  return (
    <svg className="ego-graph" viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`${drug.name} and ${partners.length} of its documented interaction partners`}>
      <defs>
        <radialGradient id="ego-core">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={centre} cy={centre} r="150" className="ego-orbit" />
      <circle cx={centre} cy={centre} r="90" className="ego-orbit" />
      {partners.map((partner, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / partners.length;
        const radius = i % 2 ? 150 : 175;
        const x = centre + radius * Math.cos(angle);
        const y = centre + radius * Math.sin(angle);
        return (
          <a key={partner.id} href={`#/drugs/${partner.id}`} className={`ego-node sev-${partner.severity}`}>
            <title>{`${partner.name}: ${LABELS[partner.severity]}${partner.contraindicated ? ', contraindicated' : ''}`}</title>
            <motion.line
              x1={centre} y1={centre} x2={x} y2={y}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.8 }}
              transition={{ delay: 0.2 + i * 0.03, duration: 0.6 }}
            />
            <motion.circle
              cx={x} cy={y} r={partner.contraindicated ? 9 : 7}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5 + i * 0.03, type: 'spring' }}
            />
            <text x={x} y={y + (y > centre ? 22 : -14)} textAnchor="middle">{partner.name.length > 14 ? `${partner.name.slice(0, 13)}…` : partner.name}</text>
          </a>
        );
      })}
      <circle cx={centre} cy={centre} r="60" fill="url(#ego-core)" className="ego-pulse" />
      <circle cx={centre} cy={centre} r="26" className="ego-centre" />
      <text x={centre} y={centre + 48} textAnchor="middle" className="ego-centre-label">{drug.name}</text>
    </svg>
  );
}

function StructureCard({ drugId }) {
  const [structure, setStructure] = useState(null);
  const [view, setView] = useState('3d');
  useEffect(() => {
    const controller = new AbortController();
    getStructure(drugId, controller.signal).then(setStructure).catch(() => {});
    return () => controller.abort();
  }, [drugId]);
  const show3d = view === '3d' && structure?.molblock;
  const elements = structure ? [...new Set(structure.formula.match(/[A-Z][a-z]?/g))].filter((s) => ATOM_COLORS[s]) : [];

  return (
    <section className="glass-card structure-card" aria-labelledby="structure-heading">
      <div className="panel-head">
        <h2 id="structure-heading">Structure</h2>
        <div className="segmented" role="group" aria-label="View">
          {['2d', '3d'].map((option) => (
            <button key={option} type="button" aria-pressed={(option === '3d') === Boolean(show3d)}
              disabled={option === '3d' && structure && !structure.molblock} onClick={() => setView(option)}>
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="structure-stage">
        {!structure && <p className="hint">Loading structure…</p>}
        {structure && show3d && <Molecule3D molblock={structure.molblock} spin label={`3D model of ${structure.name}`} />}
        {structure && !show3d && <img className="structure-img big" src={svgSrc(structure.svg)} alt={`2D structure of ${structure.name}`} />}
      </div>
      {show3d && (
        <ul className="atom-key" aria-label="Atom colours">
          {elements.map((symbol) => (
            <li key={symbol}><span className="atom-dot" style={{ background: ATOM_COLORS[symbol] }} />{symbol}</li>
          ))}
        </ul>
      )}
      {structure?.note3d && <p className="hint">{structure.note3d}</p>}
      {structure && (
        <p className="fine-print">
          <Formula value={structure.formula} /> · <span className="num">{structure.molecularWeight}</span> g/mol · drawn by RDKit from the SMILES;
          the 3D shape is a computed conformer, not an experimental structure.
        </p>
      )}
    </section>
  );
}

function DrugPage({ drugId, onCheckWith }) {
  const [drug, setDrug] = useState(null);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(LIST_STEP);

  useEffect(() => {
    const controller = new AbortController();
    setDrug(null);
    getDrug(drugId, controller.signal)
      .then(setDrug)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      });
    return () => controller.abort();
  }, [drugId]);

  if (error) {
    return (
      <section className="page-band">
        <h1>Drug not found</h1>
        <p>{error}. <a href="#/drugs">Back to the drug library</a>.</p>
      </section>
    );
  }
  if (!drug) return <p className="hint page-loading">Loading…</p>;

  const total = Math.max(1, drug.interactionTotal);

  return (
    <div className="drug-page">
      <section className="page-band drug-band">
        <a className="back-link" href="#/drugs"><Icon name="arrowRight" size={14} className="flip" /> Drug library</a>
        <h1>{drug.name}</h1>
        <div className="tag-row">
          {drug.identifiers.drugbank[0] && <span className="tag mono">{drug.identifiers.drugbank[0]}</span>}
          <span className="tag tag-accent">{drug.interactionTotal.toLocaleString('en-US')} documented interaction partners</span>
          {drug.bySeverity.major > 0 && <span className="tag tag-major">{drug.bySeverity.major} major</span>}
        </div>
        <button type="button" className="primary pill band-action" onClick={() => onCheckWith({ id: drug.id, name: drug.name })}>
          <Icon name="bolt" size={16} /> Check with other drugs
        </button>
      </section>

      <section className="glass-card about-card" aria-labelledby="about-heading">
        <h2 id="about-heading" className="card-title"><Icon name="info" size={18} /> What is {drug.name}?</h2>
        {drug.description ? (
          <>
            <p className="about-text">{drug.description}</p>
            <p className="fine-print">
              Definition from MeSH, U.S. National Library of Medicine
              {' · '}
              <a href={`https://meshb.nlm.nih.gov/record/ui?ui=${drug.meshId}`} target="_blank" rel="noreferrer">
                {drug.meshId} <Icon name="arrowUpRight" size={11} />
              </a>
              {' · '}General information, not advice about your own treatment.
            </p>
          </>
        ) : (
          <p className="hint">MeSH has no plain-language description for this drug. The identifiers below link to sources that may.</p>
        )}
      </section>

      <div className="drug-grid">
        <section className="glass-card facts-card" aria-label="Facts">
          <dl className="fact-rows">
            <div>
              <dt>Also known as</dt>
              <dd>{drug.synonyms.length ? drug.synonyms.join(', ') : '—'}</dd>
            </div>
            <div>
              <dt>SMILES</dt>
              <dd>{drug.smiles ? <CopyText text={drug.smiles} label="SMILES" /> : '—'}</dd>
            </div>
            <div>
              <dt>InChIKey</dt>
              <dd>{drug.inchikey ? <CopyText text={drug.inchikey} label="InChIKey" /> : '—'}</dd>
            </div>
            <div>
              <dt>InChI</dt>
              <dd>{drug.inchi ? <CopyText text={drug.inchi} label="InChI" /> : '—'}</dd>
            </div>
          </dl>

          <h2 className="card-title"><Icon name="merge" size={18} /> Identifier mapping</h2>
          <ul className="id-map">
            {ID_SOURCES.map(([key, label, url], i) => (
              <motion.li key={key} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07 }}>
                <span className="id-source">{label}</span>
                <span className="id-line" aria-hidden="true" />
                <span className="id-values">
                  {drug.identifiers[key].length === 0 && <span className="hint">not mapped</span>}
                  {drug.identifiers[key].map((value) => (url ? (
                    <a key={value} href={url(value)} target="_blank" rel="noreferrer">{value} <Icon name="arrowUpRight" size={12} /></a>
                  ) : <code key={value}>{value}</code>))}
                </span>
              </motion.li>
            ))}
          </ul>
          <p className="fine-print">
            DrugBank and PubChem ids come from TDC and PubChem; DDInter ids from DDInter’s own DrugBank links; KEGG ids by
            matching PubChem records. <a href="#/research/mapping">How the mapping works</a>.
          </p>
        </section>

        <StructureCard drugId={drug.id} />
      </div>

      <section className="glass-card severity-card" aria-labelledby="severity-heading">
        <h2 id="severity-heading" className="card-title"><Icon name="chart" size={18} /> Documented interactions by severity</h2>
        <div className="sev-stack" role="img" aria-label={ORDER.map((level) => `${drug.bySeverity[level]} ${LABELS[level]}`).join(', ')}>
          {ORDER.map((level, i) => (
            <motion.span key={level} className={`sev-fill sev-${level}`}
              initial={{ width: 0 }} animate={{ width: `${(drug.bySeverity[level] / total) * 100}%` }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
          ))}
        </div>
        <ul className="sev-legend">
          {ORDER.map((level) => (
            <li key={level} className={`sev-${level}`}><span className="sev-dot" />{LABELS[level]} <span className="num">{drug.bySeverity[level]}</span></li>
          ))}
        </ul>
      </section>

      <div className="drug-grid network-grid">
        <section className="glass-card" aria-labelledby="network-heading">
          <h2 id="network-heading" className="card-title"><Icon name="network" size={18} /> Interaction network</h2>
          <p className="hint">Up to {NETWORK_SIZE} partners, a few from each severity. Hover to name one, click to open it.</p>
          {drug.partners.length > 0 ? <InteractionNetwork drug={drug} /> : <p className="hint">No documented interactions in our sources.</p>}
        </section>

        <section className="glass-card" aria-labelledby="partners-heading">
          <h2 id="partners-heading" className="card-title"><Icon name="layers" size={18} /> Documented partners</h2>
          <p className="hint">
            Showing {Math.min(shown, drug.partners.length)} of {drug.interactionTotal}, most serious first. No record does not mean safe.
          </p>
          <ol className="partner-list">
            {drug.partners.slice(0, shown).map((partner) => (
              <li key={partner.id}>
                <a href={`#/drugs/${partner.id}`}>{partner.name}</a>
                <span className={`sev-pill sev-${partner.severity}`}>{LABELS[partner.severity]}</span>
                {partner.contraindicated && <span className="stamp">Contraindicated</span>}
                <p>{partner.description}</p>
              </li>
            ))}
          </ol>
          {shown < drug.partners.length && (
            <button type="button" className="secondary small pill show-more" onClick={() => setShown(shown + LIST_STEP)}>
              Show {Math.min(LIST_STEP, drug.partners.length - shown)} more
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

export default DrugPage;
