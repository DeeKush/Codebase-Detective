import React, { useEffect, useState } from 'react';
import { signUp, logIn, AuthError } from './auth.js';
import { challenges } from './challenges/index.js';
import { DURATIONS } from './session.js';

const AUTH_ERRORS = {
  google_denied: 'Google sign-in was cancelled. You can try again or use your email.',
  google_state: 'That sign-in link expired or came from another browser. Please try again.',
  google_failed: 'Google sign-in did not complete. Try again or use your email.'
};

const STEPS = [
  ['Draw a case', 'You are assigned one codebase at random, so there is nothing to memorise in advance.'],
  ['Read and trace', 'Open the files and the bug report, form a hypothesis, and say it before you ask the AI anything.'],
  ['Fix and verify', 'Change the code and run the tests you can see. They pass on the buggy code, so you have to find the case they miss.'],
  ['Explain and submit', 'Hidden tests run on submit. You answer four short questions, then read a report that cites its evidence.']
];
const CRITERIA = [
  ['Code reading', 'Did you trace what the code actually does, and say what it returns, before changing it?'],
  ['Debugging', 'Did you form a hypothesis first, find the root cause, and verify the fix?'],
  ['AI fluency', 'Were your questions precise, and did you catch or check the AI’s mistakes instead of accepting them?'],
  ['Communication', 'Can you explain your reasoning clearly, in your narration and written answers?']
];
const FAQ = [
  ['Can I use the AI assistant?', 'Yes, that is part of the round. It can read your files and answer questions but cannot edit or run code, and hints are off. How you use it is scored.'],
  ['What happens when time runs out?', 'Your work is submitted as it stands: hidden tests run on it and the report is generated from what you have.'],
  ['Which languages and codebases?', 'JavaScript. Each round is one of {count} small, realistic codebases, each with a real defect and tests that pass until you find the missing case.'],
  ['Is my code private?', 'Your work is stored in your account. It is sent to Groq to answer your questions and write your report, and hidden tests run in an isolated sandbox with no network. We run no ads or trackers. The privacy page has the details.'],
  ['Can someone cheat the hidden tests?', 'They are not in the page you receive; they run on the server. The grading sandbox has no network and none of our secrets.'],
  ['Does it cost anything?', 'No. It is a practice tool.']
];

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.3-4 6.8-9.9 6.8-16.9z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.3-8.8 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function AuthCard({ onAuth, googleEnabled, initialError }) {
  const [mode, setMode] = useState('signup'); // signup | login
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const signup = mode === 'signup';
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { await onAuth(await (signup ? signUp(form) : logIn(form))); }
    catch (err) { setError(err instanceof AuthError ? err.message : 'Something went wrong. Try again.'); setBusy(false); }
  }
  const switchMode = next => { setMode(next); setError(''); };

  return (
    <section className="auth" id="start" aria-label={signup ? 'Create an account' : 'Log in'}>
      <div className="auth-tabs" role="tablist">
        <button role="tab" aria-selected={signup} className={signup ? 'on' : ''} onClick={() => switchMode('signup')}>Create account</button>
        <button role="tab" aria-selected={!signup} className={!signup ? 'on' : ''} onClick={() => switchMode('login')}>Log in</button>
      </div>

      {googleEnabled && (
        <>
          <a className="google" href="/api/auth/google"><GoogleMark /> Continue with Google</a>
          <p className="or"><span>or use your email</span></p>
        </>
      )}

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
      <p className="fine">By continuing you agree to the <a href="/terms.html">terms</a> and the <a href="/privacy.html">privacy policy</a>.</p>
    </section>
  );
}

export default function Welcome({ onAuth }) {
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [initialError] = useState(() => {
    const code = new URLSearchParams(location.search).get('auth_error');
    return code ? (AUTH_ERRORS[code] || AUTH_ERRORS.google_failed) : '';
  });

  useEffect(() => {
    if (initialError) history.replaceState(null, '', location.pathname);
    fetch('/api/auth/config').then(r => r.json()).then(c => setGoogleEnabled(Boolean(c.google))).catch(() => {});
  }, []);

  return (
    <div className="lobby">
      <header className="lobby-head">
        <a className="wordmark" href="/">Codebase Detective</a>
        <nav aria-label="Sections" className="topnav">
          <a href="#how">How it works</a>
          <a href="#scoring">Scoring</a>
          <a href="#faq">FAQ</a>
        </nav>
      </header>

      <main>
        <div className="lobby-grid hero">
          <div className="lobby-main">
            <h1>Read it.<br />Trace it.<br />Fix it.</h1>
            <p className="lede">You get an unfamiliar codebase with a bug nobody has explained, an AI assistant, and a clock. We score how you read, how you debug, and how you check what the AI tells you.</p>
            <ul className="promises">
              <li><strong>A random case every time.</strong> {challenges.length} different codebases, so you cannot prepare for one.</li>
              <li><strong>You choose the length.</strong> {DURATIONS.map(d => d.minutes).join(', ')} minutes.</li>
              <li><strong>A report with evidence.</strong> Every score cites what you did.</li>
            </ul>
          </div>
          <AuthCard onAuth={onAuth} googleEnabled={googleEnabled} initialError={initialError} />
        </div>

        <section className="band" id="how" aria-labelledby="how-h">
          <h2 id="how-h">How a round works</h2>
          <ol className="steps wide-steps">
            {STEPS.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}
          </ol>
        </section>

        <section className="band" id="lengths" aria-labelledby="len-h">
          <h2 id="len-h">Pick how long you have</h2>
          <div className="lengths">
            {DURATIONS.map(d => (
              <div key={d.minutes} className="length">
                <span className="mins">{d.minutes}<small>min</small></span>
                <strong>{d.label}</strong>
                <span>{d.blurb}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="band" id="scoring" aria-labelledby="score-h">
          <h2 id="score-h">What you are scored on</h2>
          <div className="criteria-grid">
            {CRITERIA.map(([title, text]) => <div key={title}><strong>{title}</strong><p>{text}</p></div>)}
          </div>
          <p className="band-note">Test results come from hidden tests run on the server and are shown separately from the AI’s judgement. Every score in the report points to the evidence behind it: your diff, your test runs, your answers, your notes and your conversation with the assistant.</p>
        </section>

        <section className="band" id="faq" aria-labelledby="faq-h">
          <h2 id="faq-h">Questions</h2>
          <div className="faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a.replace('{count}', challenges.length)}</p></details>)}
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <span>© 2026 Codebase Detective</span>
        <nav aria-label="Legal">
          <a href="/privacy.html">Privacy</a>
          <a href="/terms.html">Terms</a>
          <a href="https://github.com/suryawanshiheramb11/deepak">Source</a>
        </nav>
      </footer>
    </div>
  );
}
