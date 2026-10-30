import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { getStats } from '../api';
import Icon from './Icon';
import KnowledgeGraph from './KnowledgeGraph';

const ID_COVERAGE = [
  ['drugbank', 'DrugBank ID', 'from TDC'],
  ['pubchem', 'PubChem CID', 'PubChem PUG REST'],
  ['inchikey', 'InChIKey', 'computed by RDKit'],
  ['kegg', 'KEGG DRUG ID', 'KEGG → PubChem SID → CID'],
  ['ddinter', 'DDInter ID', 'DDInter’s own DrugBank links'],
];

// [from, route, to]: how an outside id reaches our drug_id. Counts from data/raw/ddinter_to_drugbank_map.csv.
const ROUTES = [
  ['TDC DrugBank ID', 'one row per drug', 'drug_id (pg_…)'],
  ['DDInter ID', '2,077 by DDInter’s DrugBank links · 29 by K-Paths · 2 by exact name', 'DrugBank ID'],
  ['KEGG D-number', 'KEGG’s PubChem SID → PubChem CID', 'PubChem CID'],
  ['PubChem CID', 'matched on the CID TDC’s drug resolves to', 'drug_id (pg_…)'],
  ['SMILES', 'RDKit MolToInchi / MolToInchiKey', 'InChI · InChIKey'],
];

const SOURCES = [
  ['TDC DDI DrugBank', 'Interactions, DrugBank ids, SMILES', '191,402 pairs, 1,706 drugs', 'Derived from DrugBank; cite TDC and DrugBank, no bulk export'],
  ['DDInter 2.0', 'Severity; DrugBank links for mapping', '295,184 pairs, 2,283 drugs', 'CC BY-NC-SA 4.0; cite Tian et al., NAR 2025'],
  ['KEGG DDI', 'Severity (CI / P), KEGG drug ids', 'live API, cached', 'Academic use; don’t redistribute'],
  ['Ayvaz et al. 2015', 'Severity from FrenchDB, NDF-RT, OSCAR and others', 'conservative merged file', 'No licence file; cite the paper, don’t redistribute'],
  ['PubChem', 'CIDs, names, synonyms', 'every TDC drug', 'Public domain'],
];

const PIPELINE = [
  ['database', 'Capture', 'Download the source files, checksum each one.'],
  ['merge', 'Map identifiers', 'DDInter, KEGG and PubChem onto DrugBank ids.'],
  ['shield', 'Merge severity', 'Most severe level wins; every raw label kept.'],
  ['layers', 'Build tables', 'drugs and known_interactions, checked against the data dictionary.'],
  ['cube', 'Structures', 'Fingerprints, InChIKeys and offline 3D models.'],
  ['network', 'Graph', 'PyG graph and a leak-free train / validation / test split.'],
];

function Section({ id, eyebrow, title, intro, children }) {
  return (
    <section id={`research-${id}`} className="research-section" aria-labelledby={`${id}-heading`}>
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-heading`}>{title}</h2>
        {intro && <p className="section-sub">{intro}</p>}
      </motion.div>
      {children}
    </section>
  );
}

function Research({ section }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getStats(controller.signal).then(setStats).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!section) return undefined;
    const timer = setTimeout(() => document.getElementById(`research-${section}`)?.scrollIntoView({ behavior: 'smooth' }), 350);
    return () => clearTimeout(timer);
  }, [section]);

  return (
    <div className="research">
      <section className="page-band research-band">
        <svg className="band-network" viewBox="0 0 600 240" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => {
            const x = 30 + ((i * 97) % 540);
            const y = 30 + ((i * 53) % 180);
            const nx = 30 + (((i + 5) * 97) % 540);
            const ny = 30 + (((i + 5) * 53) % 180);
            return (
              <g key={i}>
                <motion.line x1={x} y1={y} x2={nx} y2={ny} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: i * 0.05, duration: 1.2 }} />
                <motion.circle cx={x} cy={y} r={3 + (i % 3)} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 3 + (i % 4), repeat: Infinity }} />
              </g>
            );
          })}
        </svg>
        <p className="eyebrow">Research</p>
        <h1>The data behind every answer</h1>
        <p>Where each interaction comes from, how every drug’s identifiers line up, and how the tables join, down to the column.</p>
        <nav className="band-tabs" aria-label="On this page">
          {[['graph', 'Knowledge graph'], ['mapping', 'Identifier mapping'], ['sources', 'Sources'], ['pipeline', 'Pipeline']].map(([key, label]) => (
            <a key={key} href={`#/research/${key}`} aria-current={section === key ? 'true' : undefined}>{label}</a>
          ))}
        </nav>
      </section>

      <Section id="graph" eyebrow="Knowledge graph" title="Nodes inside nodes"
        intro="Each module holds the tables built from it. Open a module to see its tables, then follow the ids that join them.">
        <KnowledgeGraph />
      </Section>

      <Section id="mapping" eyebrow="Identifier mapping" title="One drug, many names"
        intro="Every source names drugs its own way. This is how many of our drugs carry each identifier, and the route each one takes to our drug_id.">
        <div className="mapping-grid">
          <ul className="coverage glass-card">
            {ID_COVERAGE.map(([key, label, via], i) => {
              const value = stats?.identifiers[key];
              const share = stats ? value / stats.drugs : 0;
              return (
                <li key={key}>
                  <span className="coverage-label"><strong>{label}</strong><small>{via}</small></span>
                  <span className="coverage-bar">
                    <motion.span initial={{ width: 0 }} whileInView={{ width: `${share * 100}%` }} viewport={{ once: true }}
                      transition={{ delay: i * 0.1, duration: 1, ease: [0.16, 1, 0.3, 1] }} />
                  </span>
                  <span className="num coverage-value">{stats ? `${value.toLocaleString('en-US')} / ${stats.drugs.toLocaleString('en-US')}` : '—'}</span>
                </li>
              );
            })}
          </ul>
          <ol className="routes">
            {ROUTES.map(([from, route, to], i) => (
              <motion.li key={from} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                <span className="route-chip">{from}</span>
                <span className="route-arrow"><span>{route}</span></span>
                <span className="route-chip to">{to}</span>
              </motion.li>
            ))}
          </ol>
        </div>
        <p className="fine-print">Not mapped yet: ATC, CAS, UNII, ChEMBL and MeSH. None of our sources provides them.</p>
      </Section>

      <Section id="sources" eyebrow="Sources" title="Where the data comes from" intro="Every result keeps the label its source gave it. These are the terms we work under.">
        <div className="table-card">
          <table className="source-table">
            <thead><tr><th>Source</th><th>What we take</th><th>Size</th><th>Terms</th></tr></thead>
            <tbody>
              {SOURCES.map(([name, take, size, terms]) => (
                <tr key={name}><th scope="row">{name}</th><td>{take}</td><td>{size}</td><td>{terms}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="pipeline" eyebrow="Pipeline" title="How the data is built" intro="Everything heavy runs offline. The website only reads the finished tables.">
        <ol className="pipeline">
          {PIPELINE.map(([icon, title, text], i) => (
            <motion.li key={title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
              <span className="pipe-orb"><Icon name={icon} size={20} /></span>
              <strong>{title}</strong>
              <p>{text}</p>
            </motion.li>
          ))}
        </ol>
        <div className="glass-card model-status">
          <Icon name="info" size={20} />
          <p>
            <strong>Model status.</strong> The graph neural network isn’t trained yet. The logistic-regression baseline on
            fingerprint pairs scores a test AUPR of 0.858 (0.501 for random guessing), on a split where every test drug
            also appears in training, so expect lower scores on new drugs.
          </p>
        </div>
      </Section>
    </div>
  );
}

export default Research;
