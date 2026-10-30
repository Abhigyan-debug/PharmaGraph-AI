import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { searchDrugs } from '../api';
import Icon from './Icon';

const SHORTCUTS = [
  ['#/check', 'bolt', 'Open the interaction checker'],
  ['#/drugs', 'pill', 'Browse the drug library'],
  ['#/research/graph', 'network', 'Explore the knowledge graph'],
  ['#/research/mapping', 'merge', 'See how identifiers map'],
];

function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchDrugs(text, controller.signal)
        .then((drugs) => {
          setResults(drugs.slice(0, 8));
          setActive(0);
        })
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const items = query.trim().length >= 2
    ? results.map((drug) => [`#/drugs/${drug.id}`, 'atom', drug.name])
    : SHORTCUTS;

  const go = (href) => {
    window.location.hash = href;
    onClose();
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && items[active]) {
      go(items[active][0]);
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 30 } }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
          >
            <div className="palette-input">
              <Icon name="search" size={18} />
              <input
                autoFocus
                value={query}
                placeholder="Search a drug by name or brand…"
                aria-label="Search a drug"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
              />
              <kbd>Esc</kbd>
            </div>
            <ul className="palette-list" role="listbox">
              {items.map(([href, icon, label], i) => (
                <li
                  key={href + label}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(href)}
                >
                  <Icon name={icon} size={16} />
                  <span>{label}</span>
                  {i === active && <motion.span layoutId="palette-active" className="palette-active" />}
                  <Icon name="arrowRight" size={14} className="palette-go" />
                </li>
              ))}
              {query.trim().length >= 2 && results.length === 0 && <li className="palette-empty">No drug matches “{query.trim()}”.</li>}
            </ul>
            <p className="palette-foot">Drug pages need an account. The checker on the home page doesn’t.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CommandPalette;
