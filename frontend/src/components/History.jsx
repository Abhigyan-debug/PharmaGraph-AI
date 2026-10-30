import { useEffect, useState } from 'react';

import { deleteAccount, deleteCheck, listChecks } from '../api';

function History({ user, onRerun, onAccountDeleted }) {
  const [checks, setChecks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listChecks().then(setChecks).catch((err) => setError(err.message));
  }, []);

  const remove = async (id) => {
    try {
      await deleteCheck(id);
      setChecks((current) => current.filter((check) => check.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const removeAccount = async () => {
    if (!window.confirm('Delete your account and every saved check? This cannot be undone.')) return;
    try {
      await deleteAccount();
      onAccountDeleted();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="sheet" aria-labelledby="history-heading">
      <h1 id="history-heading">Your checks</h1>
      <p className="hint history-note">
        Signed in as <strong>{user.email}</strong>. Only the drugs and the time of each check are saved, and
        only you can see them.
      </p>

      {error && <p className="error-text" role="alert">{error}</p>}
      {!error && !checks && <p className="hint">Loading…</p>}
      {checks?.length === 0 && (
        <p className="hint">
          No saved checks yet. <a href="#/check">Check some drugs</a>.
        </p>
      )}

      {checks?.length > 0 && (
        <ol className="history">
          {checks.map((check) => (
            <li key={check.id}>
              <div>
                <p className="history-drugs">{check.drugs.map((drug) => drug.name).join(', ')}</p>
                <p className="checked-at">
                  {check.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <div className="history-actions">
                <button type="button" className="secondary" onClick={() => onRerun(check.drugs)}>
                  Check again
                </button>
                <button type="button" className="text-button" onClick={() => remove(check.id)}>
                  Delete<span className="visually-hidden"> this check</span>
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="danger-zone">
        <h2>Delete account</h2>
        <p className="hint">Removes your account, your sign-in sessions and every saved check, straight away.</p>
        <button type="button" className="danger" onClick={removeAccount}>
          Delete my account
        </button>
      </div>
    </section>
  );
}

export default History;
