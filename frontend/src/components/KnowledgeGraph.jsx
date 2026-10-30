import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import Icon from './Icon';

// Mirrors the data model in docs/architecture.md.
const MODULES = [
  { id: 'sources', label: 'Sources', x: 190, y: 190, tables: ['tdc', 'ddinter', 'kegg', 'ayvaz', 'pubchem'] },
  { id: 'drugs', label: 'Drugs', x: 560, y: 150, tables: ['drugs', 'identifiers', 'conformers'] },
  { id: 'interactions', label: 'Interactions', x: 470, y: 470, tables: ['severity', 'known'] },
  { id: 'ml', label: 'Graph & ML', x: 850, y: 440, tables: ['features', 'graph', 'split', 'baseline'] },
  { id: 'accounts', label: 'Accounts', x: 900, y: 130, tables: ['users', 'sessions', 'checks'] },
];

const TABLES = {
  tdc: ['TDC DDI', 'Interaction graph from DrugBank: 191,402 pairs over 1,706 drugs, with SMILES.'],
  ddinter: ['DDInter 2.0', 'Severity ratings (major, moderate, minor, unknown) and each drug’s DrugBank link. CC BY-NC-SA 4.0.'],
  kegg: ['KEGG DDI', 'CI / P labels from the live KEGG API, matched to our drugs by structure.'],
  ayvaz: ['Ayvaz et al.', 'Merged severity from FrenchDB, KEGG 2014, NDF-RT, OSCAR, World-Vista and ONC lists.'],
  pubchem: ['PubChem', 'CID, readable names and synonyms for search. Public domain.'],
  drugs: ['drugs', '1,706 rows: our drug_id, name, synonyms, DrugBank id, PubChem CID, SMILES.'],
  identifiers: ['identifiers', 'DDInter ids (1,241 drugs), KEGG ids (1,423), InChI and InChIKey (1,701).'],
  conformers: ['conformers', 'RDKit 3D models: 1,609 drugs, 8 with stereochemistry not enforced.'],
  severity: ['severity_by_pair', 'One severity per pair: the most severe level any source gives, raw labels kept.'],
  known: ['known_interactions', '191,808 rows: each documented pair and interaction type, with severity and sources.'],
  features: ['node_features', '1,705 × 2,048 Morgan fingerprints, one row per drug.'],
  graph: ['pharmgraph.pt', 'PyG graph: 1,705 nodes and 191,392 undirected edges.'],
  split: ['edge_split', '70 / 15 / 15 train, validation and test edges with 1:1 negatives, seed 42.'],
  baseline: ['baseline', 'Logistic regression on fingerprint pairs: test AUPR 0.858 (random 0.501).'],
  users: ['users', 'Email and scrypt password hash. Nothing else about the person.'],
  sessions: ['user_sessions', 'SHA-256 of each sign-in token, with its expiry.'],
  checks: ['saved_checks', 'Drug ids and time of each saved check, visible only to its owner.'],
};

// [from, to, join id, "loose" = joined by value, without a foreign key]
const LINKS = [
  ['tdc', 'drugs', 'drugbank_id'], ['tdc', 'known', 'drugbank_id pair'], ['pubchem', 'drugs', 'pubchem_cid'],
  ['ddinter', 'severity', 'ddinter_id → drugbank_id'], ['kegg', 'severity', 'pubchem_cid'], ['ayvaz', 'severity', 'drugbank_id'],
  ['ddinter', 'identifiers', 'ddinter_id'], ['kegg', 'identifiers', 'kegg_id'],
  ['severity', 'known', 'pair_key'], ['known', 'drugs', 'drug_a_id, drug_b_id'],
  ['drugs', 'identifiers', 'drug_id'], ['drugs', 'conformers', 'drug_id'],
  ['drugs', 'features', 'drug_id → row'], ['known', 'graph', 'pair_key → edge'], ['features', 'graph', 'row index'],
  ['graph', 'split', 'edge index'], ['split', 'baseline', 'train / test edges'], ['features', 'baseline', 'X'],
  ['sessions', 'users', 'user_id'], ['checks', 'users', 'user_id'], ['checks', 'drugs', 'drug_ids', true],
];

const CLOSED_R = 58;
const OPEN_R = 132;
const TABLE_R = 24;

const moduleOf = Object.fromEntries(MODULES.flatMap((m) => m.tables.map((t) => [t, m])));

function tablePosition(table, open) {
  const module = moduleOf[table];
  if (!open.has(module.id)) return { x: module.x, y: module.y };
  const i = module.tables.indexOf(table);
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / module.tables.length;
  const ring = module.tables.length > 3 ? 78 : 66;
  return { x: module.x + ring * Math.cos(angle), y: module.y + ring * Math.sin(angle) };
}

// A gentle curve; same number of commands every time, so Motion can morph between layouts.
function curve(a, b) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const bend = 0.18;
  return `M ${a.x} ${a.y} Q ${mx - (b.y - a.y) * bend} ${my + (b.x - a.x) * bend} ${b.x} ${b.y}`;
}

function wrap(label) {
  return label.length > 11 && label.includes('_') ? label.replace('_', '_\n') : label;
}

function KnowledgeGraph() {
  const [open, setOpen] = useState(() => new Set(['drugs', 'interactions']));
  const [selected, setSelected] = useState('known');
  const [showJoins, setShowJoins] = useState(false);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef(null);

  const toggle = (id) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const zoom = (factor) => setView((v) => ({ ...v, k: Math.min(2.2, Math.max(0.6, v.k * factor)) }));
  const keyboard = (action) => (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  const onPointerDown = (event) => {
    if (event.target.closest('.kg-node')) return;
    drag.current = { x: event.clientX, y: event.clientY, start: view };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (!drag.current) return;
    const { x, y, start } = drag.current;
    setView({ ...start, x: start.x + (event.clientX - x), y: start.y + (event.clientY - y) });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const visibleLinks = LINKS.filter(([a, b]) => {
    const sameClosed = moduleOf[a] === moduleOf[b] && !open.has(moduleOf[a].id);
    return !sameClosed;
  });

  const [title, text] = TABLES[selected];
  const linksOfSelected = LINKS.filter(([a, b]) => a === selected || b === selected);

  return (
    <div className="kg">
      <div className="kg-canvas">
        <svg
          viewBox="0 0 1080 640"
          className="kg-svg"
          role="img"
          aria-label="Data model graph: five modules with their tables and the ids that join them"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onWheel={(event) => zoom(event.deltaY < 0 ? 1.08 : 0.92)}
        >
          <defs>
            <marker id="kg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="currentColor" />
            </marker>
          </defs>
          <motion.g animate={{ x: view.x, y: view.y, scale: view.k }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} style={{ originX: '540px', originY: '320px' }}>
            {MODULES.map((module) => (
              <g
                key={module.id}
                className={`kg-node kg-module${open.has(module.id) ? ' is-open' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={open.has(module.id)}
                aria-label={`${module.label} module, ${module.tables.length} tables`}
                onClick={() => toggle(module.id)}
                onKeyDown={keyboard(() => toggle(module.id))}
              >
                <motion.circle cx={module.x} cy={module.y} initial={false} animate={{ r: open.has(module.id) ? OPEN_R : CLOSED_R }}
                  transition={{ type: 'spring', stiffness: 160, damping: 18 }} />
                <motion.text x={module.x} textAnchor="middle" initial={false}
                  animate={{ y: open.has(module.id) ? module.y - OPEN_R - 12 : module.y + 5 }}>
                  {module.label.toUpperCase()}
                </motion.text>
              </g>
            ))}

            {visibleLinks.map(([a, b, join, loose]) => {
              const from = tablePosition(a, open);
              const to = tablePosition(b, open);
              const cross = moduleOf[a] !== moduleOf[b];
              const active = selected === a || selected === b;
              return (
                <g key={`${a}-${b}`} className={`kg-link${cross ? ' cross' : ''}${loose ? ' loose' : ''}${active ? ' active' : ''}`}>
                  <motion.path initial={false} animate={{ d: curve(from, to) }} transition={{ type: 'spring', stiffness: 160, damping: 20 }}
                    markerEnd="url(#kg-arrow)" />
                  <AnimatePresence>
                    {showJoins && (
                      <motion.text initial={{ opacity: 0 }} animate={{ opacity: 1, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 6 }}
                        exit={{ opacity: 0 }} textAnchor="middle" className="kg-join">{join}</motion.text>
                    )}
                  </AnimatePresence>
                </g>
              );
            })}

            <AnimatePresence>
              {MODULES.filter((m) => open.has(m.id)).flatMap((module) => module.tables.map((table, i) => {
                const { x, y } = tablePosition(table, open);
                const crossLinked = LINKS.some(([a, b]) => (a === table || b === table) && moduleOf[a] !== moduleOf[b]);
                return (
                  <motion.g
                    key={table}
                    className={`kg-node kg-table${crossLinked ? ' cross' : ''}${selected === table ? ' selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${TABLES[table][0]} table`}
                    aria-pressed={selected === table}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelected(table);
                    }}
                    onKeyDown={keyboard(() => setSelected(table))}
                    initial={{ opacity: 0, scale: 0.2 }}
                    animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.05, type: 'spring', stiffness: 260, damping: 18 } }}
                    exit={{ opacity: 0, scale: 0.2 }}
                    style={{ originX: `${x}px`, originY: `${y}px` }}
                  >
                    <circle cx={x} cy={y} r={TABLE_R} />
                    {wrap(TABLES[table][0]).split('\n').map((line, row) => (
                      <text key={row} x={x} y={y + TABLE_R + 14 + row * 12} textAnchor="middle">{line}</text>
                    ))}
                  </motion.g>
                );
              }))}
            </AnimatePresence>
          </motion.g>
        </svg>

        <div className="kg-tools">
          <button type="button" className="icon-button" onClick={() => zoom(1.2)} aria-label="Zoom in"><Icon name="plus" size={16} /></button>
          <button type="button" className="icon-button" onClick={() => zoom(0.83)} aria-label="Zoom out"><Icon name="minus" size={16} /></button>
          <button type="button" className="icon-button" onClick={() => setView({ x: 0, y: 0, k: 1 })} aria-label="Reset view"><Icon name="collapse" size={16} /></button>
        </div>
        <p className="kg-hint"><Icon name="info" size={14} /> Click a module to open it, a table to read about it. Drag to pan, scroll to zoom.</p>
      </div>

      <aside className="kg-side">
        <p className="kg-side-title">Legend</p>
        <ul className="kg-legend">
          <li><span className="lg lg-module" /> Module</li>
          <li><span className="lg lg-table" /> Table</li>
          <li><span className="lg lg-cross" /> Table joined to another module</li>
          <li><span className="lg lg-arrow" /> Join inside a module</li>
          <li><span className="lg lg-arrow cross" /> Join across modules</li>
          <li><span className="lg lg-arrow loose" /> Matched by value, no foreign key</li>
        </ul>
        <p className="kg-side-title">Options</p>
        <div className="kg-options">
          <button type="button" className="secondary small pill" onClick={() => setOpen(new Set(MODULES.map((m) => m.id)))}>
            <Icon name="expand" size={14} /> Open all
          </button>
          <button type="button" className="secondary small pill" onClick={() => setOpen(new Set())}>
            <Icon name="collapse" size={14} /> Close all
          </button>
        </div>
        <label className="switch">
          <input type="checkbox" checked={showJoins} onChange={(event) => setShowJoins(event.target.checked)} />
          <span className="switch-track"><span className="switch-thumb" /></span>
          Show join ids
        </label>

        <AnimatePresence mode="wait">
          <motion.div key={selected} className="kg-detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <p className="kg-detail-module">{moduleOf[selected].label}</p>
            <h3>{title}</h3>
            <p>{text}</p>
            {linksOfSelected.length > 0 && (
              <ul className="kg-detail-links">
                {linksOfSelected.map(([a, b, join]) => (
                  <li key={`${a}-${b}`}>
                    <button type="button" onClick={() => setSelected(a === selected ? b : a)}>
                      {a === selected ? '→' : '←'} {TABLES[a === selected ? b : a][0]}
                    </button>
                    <code>{join}</code>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </aside>

      <details className="kg-list">
        <summary>Read the graph as a list</summary>
        <ul>
          {MODULES.map((module) => (
            <li key={module.id}>
              <strong>{module.label}</strong>: {module.tables.map((t) => TABLES[t][0]).join(', ')}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default KnowledgeGraph;
