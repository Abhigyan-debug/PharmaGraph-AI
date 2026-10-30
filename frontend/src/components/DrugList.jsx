import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { listDrugs } from '../api';
import Icon from './Icon';

export function svgSrc(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function DrugList() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      listDrugs(page, query.trim(), controller.signal)
        .then((result) => {
          setData(result);
          setError('');
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setError(err.message);
        });
    }, query ? 250 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, query]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const most = data ? Math.max(1, ...data.drugs.map((drug) => drug.interactions)) : 1;

  return (
    <div className="catalog">
      <section className="page-band">
        <p className="eyebrow">Drug library</p>
        <h1>Every drug we can check</h1>
        <p>Structures drawn by RDKit, identifiers mapped across sources, and how many documented interactions each one has.</p>
        <label className="band-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="Filter by name…"
            aria-label="Filter drugs by name"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          {data && <span className="num band-count">{data.total.toLocaleString('en-US')} drugs</span>}
        </label>
      </section>

      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="table-card">
        <div className="drug-table" role="table" aria-label="Drugs">
          <div className="drug-row drug-head" role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">Structure</span>
            <span role="columnheader">Documented interactions</span>
            <span role="columnheader">3D</span>
          </div>
          <AnimatePresence mode="popLayout">
            {data?.drugs.map((drug, i) => (
              <motion.a
                key={drug.id}
                href={`#/drugs/${drug.id}`}
                className="drug-row"
                role="row"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { delay: i * 0.02 } }}
                exit={{ opacity: 0 }}
                whileHover={{ x: 4 }}
              >
                <span role="cell" className="drug-name">
                  <strong>{drug.name}</strong>
                  <code>{drug.drugbankId}</code>
                </span>
                <span role="cell" className="drug-thumb">
                  {drug.thumbnail ? <img className="structure-img" src={svgSrc(drug.thumbnail)} alt="" /> : <em>No structure</em>}
                </span>
                <span role="cell" className="drug-count">
                  <span className="num">{drug.interactions.toLocaleString('en-US')}</span>
                  <span className="count-bar"><motion.span initial={{ width: 0 }} animate={{ width: `${(drug.interactions / most) * 100}%` }} /></span>
                </span>
                <span role="cell">{drug.has3d ? <span className="tag-3d">3D</span> : <span className="hint">—</span>}</span>
              </motion.a>
            ))}
          </AnimatePresence>
          {data && data.drugs.length === 0 && <p className="hint table-empty">No drug matches “{query.trim()}”.</p>}
          {!data && !error && <p className="hint table-empty">Loading…</p>}
        </div>
      </div>

      {data && pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button type="button" className="secondary small pill" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="num">Page {page} of {pages}</span>
          <button type="button" className="secondary small pill" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
    </div>
  );
}

export default DrugList;
