import React, { useState } from 'react';
import { signUp, logIn, AuthError } from './auth.js';
import { challenges } from './challenges/index.js';

export default function Welcome({ onAuth }) {
  const [mode, setMode] = useState('signup'); // signup | login
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const signup = mode === 'signup';
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { onAuth(await (signup ? signUp(form) : logIn(form))); }
    catch (err) { setError(err instanceof AuthError ? err.message : 'Something went wrong. Try again.'); setBusy(false); }
  }
  function switchMode(next) { setMode(next); setError(''); }

  return (
    <main className="lobby">
      <header className="lobby-head">
        <span className="wordmark">Codebase Detective</span>
        <span className="lobby-sub">Code comprehension round</span>
      </header>

      <div className="lobby-grid">
        <div className="lobby-main">
          <h1>Read it.<br />Trace it.<br />Fix it.</h1>
          <p className="lede">You get an unfamiliar codebase with a bug nobody has explained to you, an AI assistant, and a clock. We score how you read, how you debug, and how you check what the AI tells you.</p>
          <ul className="promises">
            <li><strong>A random case every time.</strong> {challenges.length} different codebases, so you cannot prepare for one.</li>
            <li><strong>You choose the length.</strong> 10, 30 or 60 minutes.</li>
            <li><strong>A report at the end</strong> with evidence for every score.</li>
          </ul>
        </div>

        <aside className="lobby-side auth" aria-label={signup ? 'Create an account' : 'Log in'}>
          <div className="auth-tabs" role="tablist">
            <button role="tab" aria-selected={signup} className={signup ? 'on' : ''} onClick={() => switchMode('signup')}>Create account</button>
            <button role="tab" aria-selected={!signup} className={!signup ? 'on' : ''} onClick={() => switchMode('login')}>Log in</button>
          </div>

          <form onSubmit={submit} noValidate>
            {signup && (
              <label className="field">Name
                <input value={form.name} onChange={set('name')} autoComplete="name" maxLength={60} required />
              </label>
            )}
            <label className="field">Email
              <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
            </label>
            <label className="field">Password
              <span className="pw">
                <input type={show ? 'text' : 'password'} value={form.password} onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} minLength={8} required aria-describedby="pw-hint" />
                <button type="button" className="ghost small" onClick={() => setShow(s => !s)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
              </span>
              {signup && <small id="pw-hint">At least 8 characters.</small>}
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="cta wide" type="submit" disabled={busy}>{busy ? 'One moment…' : signup ? 'Create account' : 'Log in'}</button>
          </form>

          <p className="fine">Your account and results are stored in this browser only. Nothing is sent to a server, so they will not follow you to another device.</p>
        </aside>
      </div>
    </main>
  );
}
