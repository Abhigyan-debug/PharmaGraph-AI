import { useState } from 'react';

import { register, signIn } from '../api';

const MIN_PASSWORD = 12;

function AuthForm({ mode, notice, onSignedIn }) {
  const registering = mode === 'register';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSignedIn(registering ? await register(email, password, consent) : await signIn(email, password));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sheet auth" aria-labelledby="auth-heading">
      <h1 id="auth-heading">{registering ? 'Create your account' : 'Sign in'}</h1>
      {notice && <p className="hint">{notice}</p>}

      <form onSubmit={submit}>
        <label className="field-label" htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          className="text-input"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label className="field-label" htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          className="text-input"
          type="password"
          autoComplete={registering ? 'new-password' : 'current-password'}
          required
          minLength={MIN_PASSWORD}
          maxLength={128}
          aria-describedby={registering ? 'password-rule' : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {registering && (
          <p id="password-rule" className="hint">
            At least {MIN_PASSWORD} characters. A short sentence is easier to remember than symbols.
          </p>
        )}

        {registering && (
          <label className="consent">
            <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>
              Save the drugs I check to my account history. I can delete any check, or my whole account,
              at any time.
            </span>
          </label>
        )}

        {error && <p className="error-text" role="alert">{error}</p>}

        <button type="submit" className="primary auth-submit" disabled={busy}>
          {busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="hint auth-switch">
        {registering ? (
          <>Already have an account? <a href="#/signin">Sign in</a></>
        ) : (
          <>New here? <a href="#/register">Create an account</a></>
        )}
      </p>
    </section>
  );
}

export default AuthForm;
