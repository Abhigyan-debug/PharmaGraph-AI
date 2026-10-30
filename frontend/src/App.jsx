import { useEffect, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';

import { checkKnownInteractions, currentUser, onSignedOut, searchDrugs, signOut } from './api';
import AboutCheck from './components/AboutCheck';
import AuthForm from './components/AuthForm';
import { Intro } from './components/Brand';
import CommandPalette from './components/CommandPalette';
import DrugList from './components/DrugList';
import DrugPage from './components/DrugPage';
import Footer from './components/Footer';
import Header from './components/Header';
import History from './components/History';
import Landing from './components/Landing';
import Research from './components/Research';
import ResultsPanel from './components/ResultsPanel';
import SafetyPanel from './components/SafetyPanel';
import SearchPanel from './components/SearchPanel';

const MAX_DRUGS = 10;
const PAGES = ['', 'check', 'results', 'history', 'signin', 'register', 'about', 'drugs', 'research'];
const PRIVATE_PAGES = ['check', 'results', 'history', 'drugs', 'research'];
const AUTH_PAGES = ['signin', 'register'];
const INTRO_KEY = 'pg-intro-seen';

// "#/drugs/pg_000472" -> { page: "drugs", id: "pg_000472" }
function currentRoute() {
  const [, page = '', id = ''] = window.location.hash.match(/^#\/([^/]*)\/?(.*)$/) || [];
  return PAGES.includes(page) ? { page, id } : { page: '', id: '' };
}

function storage(action, key, value) {
  try {
    return action === 'get' ? window.localStorage.getItem(key) : window.localStorage.setItem(key, value);
  } catch {
    return null; // private windows can block storage; the app works without it
  }
}

function initialTheme() {
  return storage('get', 'pg-theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
}

function introAlreadySeen() {
  try {
    return window.sessionStorage.getItem(INTRO_KEY) === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

function App() {
  const [route, setRoute] = useState(currentRoute);
  const [user, setUser] = useState(undefined); // undefined while we ask the server, then null or { email }
  const [theme, setTheme] = useState(initialTheme);
  const [introDone, setIntroDone] = useState(introAlreadySeen);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState([]);
  const [report, setReport] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');

  useEffect(() => {
    const onHashChange = () => {
      setRoute(currentRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    onSignedOut(() => setUser(null));
    currentUser().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storage('set', 'pg-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (introDone) return undefined;
    const timer = setTimeout(() => setIntroDone(true), 1300);
    return () => clearTimeout(timer);
  }, [introDone]);

  useEffect(() => {
    if (!introDone) return;
    try {
      window.sessionStorage.setItem(INTRO_KEY, '1');
    } catch {
      // ignore: the intro just plays again next time
    }
  }, [introDone]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (user && AUTH_PAGES.includes(route.page)) window.location.hash = '#/check';
  }, [user, route.page]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setMatches([]);
      setSearchError('');
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchDrugs(text, controller.signal)
        .then((drugs) => {
          setMatches(drugs);
          setSearchError('');
        })
        .catch((error) => {
          if (error.name !== 'AbortError') setSearchError(error.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const toggleDrug = (drug) => {
    setSelected((current) => {
      if (current.some((item) => item.id === drug.id)) {
        return current.filter((item) => item.id !== drug.id);
      }
      return current.length < MAX_DRUGS ? [...current, drug] : current;
    });
  };

  // From the landing page the results stay on the landing page; elsewhere they open #/results.
  const checkInteractions = async (drugs, { stay = false } = {}) => {
    setChecking(true);
    setCheckError('');
    try {
      const result = await checkKnownInteractions(drugs.map((drug) => drug.id));
      setReport({ ...result, checkedAt: new Date(), saved: Boolean(user) });
      if (!stay) window.location.hash = '#/results';
    } catch (error) {
      setCheckError(error.message);
    } finally {
      setChecking(false);
    }
  };

  const rerun = (drugs) => {
    setSelected(drugs);
    window.location.hash = '#/check';
    checkInteractions(drugs);
  };

  const checkWith = (drug) => {
    setSelected((current) => (current.some((item) => item.id === drug.id) ? current : [...current, drug].slice(0, MAX_DRUGS)));
    window.location.hash = '#/check';
  };

  // Clears everything about the last person's drugs, for shared computers.
  const forget = () => {
    setUser(null);
    setSelected([]);
    setReport(null);
    setQuery('');
    window.location.hash = '#/';
  };

  const signOutAndForget = () => signOut().catch(() => {}).finally(forget);

  const search = (
    <SearchPanel
      query={query}
      onQueryChange={setQuery}
      matches={matches}
      searchError={searchError}
      selected={selected}
      maxDrugs={MAX_DRUGS}
      onToggle={toggleDrug}
      onCheck={() => checkInteractions(selected, { stay: route.page === '' })}
      checking={checking}
      checkError={checkError}
    />
  );

  const { page, id } = route;
  let content;
  if (PRIVATE_PAGES.includes(page) && user === undefined) {
    content = <p className="hint page-loading">Loading…</p>;
  } else if (PRIVATE_PAGES.includes(page) && user === null) {
    content = <AuthForm mode="signin" notice="Sign in to see this page. The quick check on the home page works without an account." onSignedIn={setUser} />;
  } else if (page === '') {
    content = <Landing user={user} search={search} report={report} />;
  } else if (page === 'check') {
    content = (
      <>
        <section className="page-band">
          <p className="eyebrow">Interaction checker</p>
          <h1>Check your drugs</h1>
          <p>Add two to ten drugs by generic or brand name. Each check is saved to your history.</p>
        </section>
        <div className="home-grid">
          {search}
          <AboutCheck />
        </div>
      </>
    );
  } else if (page === 'results') {
    content = <ResultsPanel report={report} />;
  } else if (page === 'history') {
    content = <History user={user} onRerun={rerun} onAccountDeleted={forget} />;
  } else if (page === 'drugs') {
    content = id ? <DrugPage drugId={id} onCheckWith={checkWith} /> : <DrugList />;
  } else if (page === 'research') {
    content = <Research section={id} />;
  } else if (AUTH_PAGES.includes(page)) {
    content = <AuthForm key={page} mode={page} onSignedIn={setUser} />;
  } else {
    content = <SafetyPanel />;
  }

  return (
    <LayoutGroup>
      <AnimatePresence>
        {!introDone && <Intro key="intro" onDone={() => setIntroDone(true)} />}
      </AnimatePresence>
      <div className="page">
        <Header
          page={page}
          user={user}
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          onSignOut={signOutAndForget}
          onOpenSearch={() => setPaletteOpen(true)}
          showLogo={introDone}
        />
        <AnimatePresence mode="wait">
          <motion.main
            key={page === 'drugs' ? `drugs/${id}` : page}
            className={`main main-${page || 'home'}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {content}
          </motion.main>
        </AnimatePresence>
        <Footer />
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </LayoutGroup>
  );
}

export default App;
