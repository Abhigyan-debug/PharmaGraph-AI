import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react';

import { getStats, getStructure } from '../api';
import { Formula } from './DrugPage';
import Icon from './Icon';
import Molecule3D from './Molecule3D';
import ResultsPanel from './ResultsPanel';

const HERO_DRUG = 'pg_000702'; // aspirin
const SHOWCASE = [['pg_000702', 'Aspirin'], ['pg_000472', 'Warfarin'], ['pg_000051', 'Sildenafil']];

const SEVERITY_CARDS = [
  ['major', 'alert', 'Major', 'High-risk interaction', { top: '30%', left: '-4%' }, 1.4],
  ['moderate', 'info', 'Moderate', 'Use with caution', { top: '6%', right: '-2%' }, 1.1],
  ['minor', 'check', 'Minor', 'Limited effect; still check', { top: '46%', right: '-8%' }, 1.7],
  ['unknown', 'info', 'Unknown', 'No severity from a source', { bottom: '6%', left: '6%' }, 0.9],
];

const SOURCES = [
  ['TDC', 'TDC · DrugBank DDI', 'Documented interactions'],
  ['DDI', 'DDInter 2.0', 'Severity ratings'],
  ['KG', 'KEGG', 'Severity and drug IDs'],
  ['AY', 'Ayvaz et al. 2015', 'Merged severity sets'],
  ['PC', 'PubChem', 'Names, synonyms, IDs'],
  ['RD', 'RDKit', 'Structures, 2D and 3D'],
];

const STEPS = [
  ['upload', '1. Input', 'Enter two to ten drugs by generic or brand name.'],
  ['database', '2. Check', 'Every pair is looked up in the documented sources.'],
  ['network', '3. Grade', 'Severity comes from the sources, with each source’s own label kept.'],
  ['file', '4. Results', 'Clear warnings, worst first, with references and a PDF report.'],
];

const FEATURES = [
  ['shield', 'Source-linked results', 'See exactly which database recorded each interaction and how it graded it.'],
  ['cube', '3D molecular models', 'Rotate the structure of 1,609 drugs, computed by RDKit from their SMILES.'],
  ['chart', 'Severity classification', 'Major, moderate, minor or unknown, never guessed. Contraindications only when a source says so.'],
  ['network', 'Graph model, in training', 'A graph neural network will flag likely interactions, kept apart and marked unconfirmed.'],
];

const AUDIENCE = [
  ['heart', 'Patients', 'Check your drugs before taking them together, then talk to your pharmacist.'],
  ['stethoscope', 'Healthcare professionals', 'Every pair at once, with the source label behind each severity.'],
  ['flask', 'Researchers', 'Mapped identifiers, a documented interaction graph and the pipeline behind it.'],
  ['graduation', 'Students', 'Learn how drugs interact and see each molecule in 3D.'],
];

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { type: 'spring', stiffness: 90, damping: 18 },
};

function usePointer() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 60, damping: 16 });
  const sy = useSpring(y, { stiffness: 60, damping: 16 });
  const handlers = {
    onPointerMove: (event) => {
      const box = event.currentTarget.getBoundingClientRect();
      x.set((event.clientX - box.left) / box.width - 0.5);
      y.set((event.clientY - box.top) / box.height - 0.5);
    },
    onPointerLeave: () => {
      x.set(0);
      y.set(0);
    },
  };
  return { sx, sy, handlers };
}

// A layer that drifts with the pointer: deeper layers (bigger depth) move further, like parallax.
function Layer({ sx, sy, depth, className, style, children }) {
  const x = useTransform(sx, (v) => v * depth * 46);
  const y = useTransform(sy, (v) => v * depth * 46);
  return <motion.div className={className} style={{ ...style, x, y }}>{children}</motion.div>;
}

function useStructure(drugId) {
  const [molecule, setMolecule] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setMolecule(null); // never show the last molecule under the new name while this one loads
    getStructure(drugId, controller.signal).then(setMolecule).catch(() => {});
    return () => controller.abort();
  }, [drugId]);
  return molecule;
}

function HeroScene() {
  const { sx, sy, handlers } = usePointer();
  const rotateY = useTransform(sx, [-0.5, 0.5], [12, -12]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [-9, 9]);
  const molecule = useStructure(HERO_DRUG);

  return (
    <div className="hero-scene" {...handlers}>
      <motion.div className="hero-3d" style={{ rotateX, rotateY }}>
        <Layer sx={sx} sy={sy} depth={-0.4} className="hero-platform">
          <span className="platform-ring" />
          <span className="platform-ring ring-2" />
          <span className="platform-glow" />
        </Layer>
        <Layer sx={sx} sy={sy} depth={0.3} className="hero-molecule">
          {molecule?.molblock && <Molecule3D molblock={molecule.molblock} spin interactive={false} label={`Rotating 3D model of ${molecule.name}`} />}
        </Layer>
        <Layer sx={sx} sy={sy} depth={1.6} className="capsule capsule-a" />
        <Layer sx={sx} sy={sy} depth={-1.2} className="capsule capsule-b" />
        <Layer sx={sx} sy={sy} depth={1.1} className="tablet tablet-a" />
        {SEVERITY_CARDS.map(([level, icon, title, text, position, depth], i) => (
          <Layer key={level} sx={sx} sy={sy} depth={depth} className="glass-badge-wrap" style={position}>
            <motion.div
              className={`glass-badge badge-${level} bob`}
              style={{ animationDuration: `${4 + i}s` }}
              initial={{ opacity: 0, scale: 0.7, rotateY: -30 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ delay: 0.4 + i * 0.12, type: 'spring' }}
            >
              <span className="badge-icon"><Icon name={icon} size={18} /></span>
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </motion.div>
          </Layer>
        ))}
      </motion.div>
    </div>
  );
}

function CountUp({ value }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || value == null) return undefined;
    const show = (v) => {
      if (ref.current) ref.current.textContent = Math.round(v).toLocaleString('en-US');
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      show(value);
      return undefined;
    }
    const controls = animate(0, value, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onUpdate: show });
    return () => controls.stop();
  }, [inView, value]);
  return <span ref={ref} className="num">{value == null ? '—' : '0'}</span>;
}

function Stats() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    getStats(controller.signal).then(setStats).catch(() => {});
    return () => controller.abort();
  }, []);
  const items = [
    ['search', stats?.drugs, 'drugs you can search'],
    ['file', stats?.pairs, 'documented interaction pairs'],
    ['shield', stats?.graded, 'pairs with a severity from a source'],
    ['cube', stats?.with3d, 'drugs with a 3D model'],
  ];
  return (
    <motion.ul className="stat-bar" aria-label="Coverage" {...reveal}>
      {items.map(([icon, value, label]) => (
        <li key={label}>
          <span className="stat-icon"><Icon name={icon} size={20} /></span>
          <span>
            <span className="stat-value"><CountUp value={value} /></span>
            <span className="stat-label">{label}</span>
          </span>
        </li>
      ))}
    </motion.ul>
  );
}

function SpotlightCard({ icon, title, text, index }) {
  const rotateX = useSpring(0, { stiffness: 200, damping: 20 });
  const rotateY = useSpring(0, { stiffness: 200, damping: 20 });
  const move = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - box.left) / box.width;
    const py = (event.clientY - box.top) / box.height;
    event.currentTarget.style.setProperty('--mx', `${px * 100}%`);
    event.currentTarget.style.setProperty('--my', `${py * 100}%`);
    rotateY.set((px - 0.5) * 14);
    rotateX.set((0.5 - py) * 14);
  };
  const leave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };
  return (
    <motion.li
      className="spot-card"
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={move}
      onPointerLeave={leave}
      {...reveal}
      transition={{ ...reveal.transition, delay: index * 0.08 }}
    >
      <span className="spot-icon"><Icon name={icon} size={22} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
    </motion.li>
  );
}

function PhoneMock() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const rotateY = useTransform(scrollYProgress, [0, 1], [-32, 14]);
  const rotateX = useTransform(scrollYProgress, [0, 1], [16, -6]);
  const y = useTransform(scrollYProgress, [0, 1], [60, -40]);
  return (
    <div className="phone-wrap" ref={ref}>
      <span className="capsule capsule-c" />
      <span className="tablet tablet-b" />
      <motion.div className="phone" style={{ rotateY, rotateX, y, transformPerspective: 1100 }}>
        <div className="phone-notch" />
        <p className="phone-title">Your drugs</p>
        {['Aspirin', 'Warfarin', 'Metformin'].map((name, i) => (
          <motion.div
            key={name}
            className="phone-row"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.12 }}
          >
            <span className="phone-dot" />
            {name}
            <Icon name="x" size={14} />
          </motion.div>
        ))}
        <div className="phone-button">Check interactions</div>
        <div className="phone-result">
          <span className="sev-pill sev-major">Major</span> Warfarin + Aspirin
        </div>
      </motion.div>
    </div>
  );
}

function MoleculeShowcase() {
  const [index, setIndex] = useState(0);
  const [drugId] = SHOWCASE[index];
  const molecule = useStructure(drugId);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % SHOWCASE.length), 9000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="band band-deep science" aria-labelledby="science-heading">
      <div className="grid-floor" aria-hidden="true" />
      <div className="section-inner science-inner">
        <div className="science-stage">
          {molecule?.molblock && (
            <Molecule3D key={molecule.id} molblock={molecule.molblock} spin interactive={false} label={`Rotating 3D model of ${molecule.name}`} />
          )}
          {molecule && (
            <>
              <span className="float-label label-formula bob"><Formula value={molecule.formula} /></span>
              <span className="float-label label-name bob" style={{ animationDuration: '6s' }}>{molecule.name}</span>
              <span className="float-label label-source bob" style={{ animationDuration: '7s' }}>3D model by RDKit</span>
            </>
          )}
        </div>
        <motion.div className="science-text" {...reveal}>
          <p className="eyebrow">See the science</p>
          <h2 id="science-heading">Interactive 3D molecular models</h2>
          <p>
            Every drug with a parsable structure gets a 2D drawing, and 1,609 of them a 3D model you can rotate.
            Each one is computed from the drug’s SMILES and labelled as a computed shape, not an experimental one.
          </p>
          <div className="segmented showcase-pick" role="group" aria-label="Molecule">
            {SHOWCASE.map(([id, label], i) => (
              <button key={id} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}>
                {label}
              </button>
            ))}
          </div>
          <a className="primary pill" href="#/drugs">
            Open the drug library <Icon name="arrowRight" size={16} />
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function Landing({ user, search, report }) {
  return (
    <div className="landing">
      <section className="band hero" aria-labelledby="hero-heading">
        <div className="hero-glow" aria-hidden="true" />
        <div className="section-inner hero-inner">
          <div className="hero-copy">
            <motion.p className="eyebrow pill-eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <span className="live-dot" /> Evidence-first drug–drug interaction checker
            </motion.p>
            <motion.h1
              id="hero-heading"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 80, damping: 16 }}
            >
              Know how your drugs interact, <em>with the source</em> for every answer.
            </motion.h1>
            <motion.p className="hero-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              PharmGraph AI checks every pair in a list of drugs against documented interaction databases, shows how
              serious each one is and who says so, and never calls a missing record “safe”.
            </motion.p>
            <motion.div className="cta-row" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <a className="primary pill" href="#try" onClick={(event) => {
                event.preventDefault();
                document.getElementById('try')?.scrollIntoView({ behavior: 'smooth' });
              }}>
                Try a check now <Icon name="arrowRight" size={16} />
              </a>
              <a className="secondary pill" href="#how" onClick={(event) => {
                event.preventDefault();
                document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' });
              }}>
                <Icon name="play" size={14} /> See how it works
              </a>
            </motion.div>
            <ul className="trust-row">
              {['No account needed to try', 'Source on every result', 'Severity never guessed'].map((text) => (
                <li key={text}><Icon name="check" size={15} strokeWidth={3} /> {text}</li>
              ))}
            </ul>
          </div>
          <HeroScene />
        </div>
        <div className="section-inner">
          <Stats />
        </div>
      </section>

      <section className="band sources" aria-labelledby="sources-heading">
        <motion.div className="section-inner center" {...reveal}>
          <p className="eyebrow">Built on published, citable data</p>
          <h2 id="sources-heading">Multiple sources. One place.</h2>
          <p className="section-sub">
            We combine and cross-check open research databases, and every result keeps the label its source gave it.
          </p>
          <ul className="source-chips">
            {SOURCES.map(([mark, name, role], i) => (
              <motion.li
                key={name}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, type: 'spring' }}
                whileHover={{ y: -4 }}
              >
                <span className="source-mark">{mark}</span>
                <span><strong>{name}</strong><small>{role}</small></span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </section>

      <section id="try" className="band try" aria-labelledby="try-heading">
        <div className="section-inner">
          <motion.div className="try-head" {...reveal}>
            <p className="eyebrow">Try it now, no account needed</p>
            <h2 id="try-heading">Check your drugs</h2>
            <p className="section-sub">
              {user
                ? 'You’re signed in, so this check is saved to your history.'
                : 'Checks here aren’t saved. Create an account to keep a private history and open drug pages.'}
            </p>
          </motion.div>
          <motion.div className="try-panel" {...reveal}>{search}</motion.div>
          {report && (
            <motion.div className="try-results" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
              <ResultsPanel report={report} />
            </motion.div>
          )}
        </div>
      </section>

      <section id="how" className="band band-sand how" aria-labelledby="how-heading">
        <div className="section-inner how-inner">
          <div>
            <motion.div {...reveal}>
              <p className="eyebrow">Simple. Transparent. Sourced.</p>
              <h2 id="how-heading">How it works</h2>
              <p className="section-sub">From your drug list to clear, source-backed results in seconds.</p>
            </motion.div>
            <ol className="steps">
              {STEPS.map(([icon, title, text], i) => (
                <motion.li key={title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }}>
                  <span className={`step-orb orb-${i}`}><Icon name={icon} size={22} /></span>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </motion.li>
              ))}
            </ol>
          </div>
          <PhoneMock />
        </div>
      </section>

      <section className="band why" aria-labelledby="why-heading">
        <div className="section-inner">
          <motion.div className="why-head" {...reveal}>
            <div>
              <p className="eyebrow">Why PharmGraph AI?</p>
              <h2 id="why-heading">More than a checker. A clearer way to understand your drugs.</h2>
            </div>
            <a className="secondary pill" href="#/research">Explore the research <Icon name="arrowRight" size={16} /></a>
          </motion.div>
          <ul className="spot-grid">
            {FEATURES.map(([icon, title, text], i) => <SpotlightCard key={title} icon={icon} title={title} text={text} index={i} />)}
          </ul>
        </div>
      </section>

      <MoleculeShowcase />

      <section className="band band-sand audience" aria-labelledby="audience-heading">
        <div className="section-inner">
          <motion.div {...reveal}>
            <p className="eyebrow">Real-world use</p>
            <h2 id="audience-heading">Who can use PharmGraph AI?</h2>
            <p className="section-sub">For patients, healthcare professionals, researchers and anyone learning how drugs interact.</p>
          </motion.div>
          <ul className="audience-grid">
            {AUDIENCE.map(([icon, title, text], i) => (
              <motion.li key={title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }} whileHover={{ y: -8 }}>
                <div className={`illustration illo-${i}`} aria-hidden="true">
                  <span className="illo-orb" />
                  <span className="illo-ring" />
                  <span className="illo-dot dot-a" />
                  <span className="illo-dot dot-b" />
                  <span className="illo-icon"><Icon name={icon} size={38} strokeWidth={1.6} /></span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>

      <section className="band honesty-band" aria-labelledby="honesty-heading">
        <motion.div className="section-inner honesty" {...reveal}>
          <h2 id="honesty-heading">What it is not</h2>
          <ul>
            <li><Icon name="alert" size={18} /> Not medical advice. Don’t stop or change a drug without your doctor or pharmacist.</li>
            <li><Icon name="info" size={18} /> No record is not the same as safe: our sources don’t cover every drug or pair.</li>
            <li><Icon name="network" size={18} /> Model predictions will be unconfirmed and kept apart. The model isn’t trained yet.</li>
          </ul>
          <a href="#/about/limitations">Read the limitations <Icon name="arrowUpRight" size={14} /></a>
        </motion.div>
      </section>

      <section className="band final" aria-labelledby="final-heading">
        <motion.div className="section-inner final-card" {...reveal}>
          <span className="capsule capsule-d" aria-hidden="true" />
          <span className="capsule capsule-e" aria-hidden="true" />
          <h2 id="final-heading">Start checking your drugs now</h2>
          <p>Get clear, source-backed answers in seconds.</p>
          <a className="primary pill" href="#try" onClick={(event) => {
            event.preventDefault();
            document.getElementById('try')?.scrollIntoView({ behavior: 'smooth' });
          }}>
            Open the checker <Icon name="arrowRight" size={16} />
          </a>
        </motion.div>
      </section>
    </div>
  );
}

export default Landing;
