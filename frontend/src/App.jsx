import { useEffect, useState } from 'react';

import { checkKnownInteractions, searchDrugs } from './api';
import Header from './components/Header';
import Hero from './components/Hero';
import ResultsPanel from './components/ResultsPanel';
import SafetyPanel from './components/SafetyPanel';
import SearchPanel from './components/SearchPanel';

const MAX_DRUGS = 10;
const ROUTES = ['#/', '#/results', '#/about/limitations'];

function currentRoute() {
  return ROUTES.includes(window.location.hash) ? window.location.hash : '#/';
}

function App() {
  const [route, setRoute] = useState(currentRoute);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState([]);
  const [report, setReport] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setMatches([]);
      setSearchError('');
      return;
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

  const checkInteractions = async () => {
    setChecking(true);
    setCheckError('');
    try {
      setReport(await checkKnownInteractions(selected.map((drug) => drug.id)));
      window.location.hash = '#/results';
    } catch (error) {
      setCheckError(error.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="app-shell">
      <Header route={route} />

      <main className="content">
        {route === '#/' && (
          <>
            <Hero />
            <SearchPanel
              query={query}
              onQueryChange={setQuery}
              matches={matches}
              searchError={searchError}
              selected={selected}
              maxDrugs={MAX_DRUGS}
              onToggle={toggleDrug}
              onCheck={checkInteractions}
              checking={checking}
              checkError={checkError}
            />
          </>
        )}
        {route === '#/results' && <ResultsPanel report={report} />}
        {route === '#/about/limitations' && <SafetyPanel />}
      </main>
    </div>
  );
}

export default App;
