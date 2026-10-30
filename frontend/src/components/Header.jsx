import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { BrandMark } from './Brand';
import Icon from './Icon';

const NAV = [
  ['', '#/', 'Home'],
  ['check', '#/check', 'Check'],
  ['drugs', '#/drugs', 'Drugs'],
];

const MENU = {
  foundation: [
    ['#/research/graph', 'Knowledge graph', 'Nodes inside nodes: every table and source, and how they join.'],
    ['#/research/mapping', 'Identifier mapping', 'How each drug lines up across DrugBank, PubChem, DDInter and KEGG.'],
  ],
  tools: [
    ['#/check', 'bolt', 'Interaction checker', 'Every pair in a list of 2–10 drugs.'],
    ['#/drugs', 'pill', 'Drug library', 'All 1,706 drugs, with structures and IDs.'],
    ['#/research/sources', 'database', 'Data sources', 'Where every interaction and severity comes from.'],
  ],
  learn: [
    ['#/research/pipeline', 'How the data is built'],
    ['#/about/limitations', 'Limitations'],
    ['#/about/limitations', 'What your account stores'],
  ],
};

const panel = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30 } },
  exit: { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.15 } },
};

function MegaMenu({ onClose }) {
  return (
    <motion.div className="mega" {...panel} onClick={(event) => event.target.closest('a') && onClose()}>
      <div className="mega-col mega-deep">
        <p className="mega-eyebrow">Foundation</p>
        {MENU.foundation.map(([href, title, text]) => (
          <a key={title} href={href} className="mega-feature">
            <strong>{title}</strong>
            <span>{text}</span>
          </a>
        ))}
      </div>
      <div className="mega-col">
        <p className="mega-eyebrow">Tools</p>
        {MENU.tools.map(([href, icon, title, text]) => (
          <a key={title} href={href} className="mega-item">
            <span className="mega-icon"><Icon name={icon} size={18} /></span>
            <span>
              <strong>{title}</strong>
              <span>{text}</span>
            </span>
          </a>
        ))}
      </div>
      <div className="mega-col">
        <p className="mega-eyebrow">Learn</p>
        {MENU.learn.map(([href, title]) => (
          <a key={title} href={href} className="mega-link">{title}</a>
        ))}
        <p className="mega-note">Decision support only. It does not replace a doctor or pharmacist.</p>
      </div>
    </motion.div>
  );
}

function ThemeToggle({ theme, onToggle }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="icon-button" onClick={onToggle} aria-label={`Switch to ${next} theme`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          className="icon-swap"
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18} />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function AccountMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="account-menu" onMouseLeave={() => setOpen(false)}>
      <button type="button" className="avatar" aria-expanded={open} aria-label="Account" onClick={() => setOpen(!open)}>
        {user.email[0].toUpperCase()}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="account-pop" {...panel}>
            <p className="account-email" title={user.email}>{user.email}</p>
            <a href="#/history" onClick={() => setOpen(false)}><Icon name="history" size={16} /> Your checks</a>
            <button type="button" onClick={onSignOut}><Icon name="logout" size={16} /> Sign out</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Header({ page, user, theme, onToggleTheme, onSignOut, onOpenSearch, showLogo }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const hoverTimer = useRef();
  const root = useRef();

  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [page]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setMobileOpen(false);
    };
    const onClick = (event) => {
      if (!root.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onClick);
    };
  }, []);

  // Hover opens the menu after a short pause, so passing the mouse over it doesn't flash it open.
  const hover = (open) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setMenuOpen(open), open ? 120 : 220);
  };

  return (
    <header className="site-header" ref={root}>
      <div className="header-inner">
        <a className="brand" href="#/" aria-label="PharmGraph AI home">
          {showLogo ? <BrandMark size={38} /> : <span className="brand-slot" />}
          <span className="brand-name">PharmGraph <b>AI</b></span>
        </a>

        <nav className="main-nav" aria-label="Main">
          {NAV.map(([key, href, label]) => (
            <a key={key} href={href} aria-current={page === key ? 'page' : undefined}>
              {page === key && <motion.span layoutId="nav-pill" className="nav-pill" />}
              <span>{label}</span>
            </a>
          ))}
          <div className="nav-menu" onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-current={page === 'research' ? 'page' : undefined}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {page === 'research' && <motion.span layoutId="nav-pill" className="nav-pill" />}
              <span>Research</span>
              <motion.span animate={{ rotate: menuOpen ? 180 : 0 }} className="caret">
                <Icon name="chevronDown" size={14} strokeWidth={2.5} />
              </motion.span>
            </button>
            <AnimatePresence>{menuOpen && <MegaMenu onClose={() => setMenuOpen(false)} />}</AnimatePresence>
          </div>
          <a href="#/about/limitations" aria-current={page === 'about' ? 'page' : undefined}>
            {page === 'about' && <motion.span layoutId="nav-pill" className="nav-pill" />}
            <span>Limitations</span>
          </a>
        </nav>

        <div className="header-actions">
          <button type="button" className="search-trigger" onClick={onOpenSearch} aria-label="Search drugs">
            <Icon name="search" size={17} />
            <span className="search-hint">Search drugs</span>
            <kbd>Ctrl K</kbd>
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          {user ? (
            <AccountMenu user={user} onSignOut={onSignOut} />
          ) : (
            user === null && (
              <a className="primary small pill" href="#/signin">Sign in</a>
            )
          )}
          <button
            type="button"
            className="icon-button menu-toggle"
            aria-label="Menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Icon name={mobileOpen ? 'x' : 'menu'} size={20} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            className="mobile-nav"
            aria-label="Mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {[...NAV, ['research', '#/research', 'Research'], ['about', '#/about/limitations', 'Limitations']].map(
              ([key, href, label], i) => (
                <motion.a
                  key={key}
                  href={href}
                  initial={{ x: -16, opacity: 0 }}
                  animate={{ x: 0, opacity: 1, transition: { delay: i * 0.04 } }}
                >
                  {label}
                </motion.a>
              ),
            )}
            {!user && <a href="#/register">Create account</a>}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

export default Header;
