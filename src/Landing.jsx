import React, { useEffect, useRef, useState } from 'react';
import { challenges, findChallenge, drawChallenge } from './challenges/index.js';
import { DURATIONS, DEFAULT_MINUTES, phasesForMinutes, recentCases, rememberCase } from './session.js';

const DRAWN_KEY = 'codebaseDetective.drawnCase';
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const read = () => { try { return sessionStorage.getItem(DRAWN_KEY); } catch { return null; } };
const write = id => { try { id ? sessionStorage.setItem(DRAWN_KEY, id) : sessionStorage.removeItem(DRAWN_KEY); } catch { /* ignore */ } };

const STEPS = [
  ['Draw a case', 'You are assigned one codebase at random. Everyone gets the same kind of task, not the same repository.'],
  ['Read and trace', 'Open the files, form a hypothesis, and say it out loud or in the notes before you ask the AI.'],
  ['Fix and verify', 'Change the code, run the tests you can see, and check the AI’s answers yourself.'],
  ['Explain', 'Submit short written answers. A report scores your reading, debugging, AI use and communication.']
];

/** Cycles case names like a departure board, slowing down until it lands on the assigned one. */
function Reel({ target, onDone }) {
  const [text, setText] = useState(target.title);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (reducedMotion()) { done.current(); return; }
    const names = challenges.map(c => c.title);
    let tick = 0, timer;
    const step = () => {
      tick++;
      setText(tick >= 16 ? target.title : names[Math.floor(Math.random() * names.length)]);
      if (tick >= 16) { timer = setTimeout(() => done.current(), 380); return; }
      timer = setTimeout(step, 55 + tick * tick * 1.4);
    };
    step();
    return () => clearTimeout(timer);
  }, [target]);
  return <p className="reel" aria-live="polite">{text}</p>;
}

function Briefing({ challenge, minutes, onStart, onBack }) {
  const duration = DURATIONS.find(d => d.minutes === minutes);
  const phases = phasesForMinutes(challenge, minutes);
  const fileCount = Object.keys(challenge.files).length;
  return (
    <section className="case" aria-labelledby="case-title">
      <p className="case-meta">{challenge.difficulty} · {fileCount} files · {challenge.hasTests ? 'tests included' : 'no test runner'}</p>
      <h2 id="case-title">{challenge.title}</h2>
      <p className="case-symptom">{challenge.description}</p>

      <dl className="case-facts">
        <div><dt>Time</dt><dd>{minutes} minutes</dd></div>
        <div><dt>Tasks</dt><dd>{phases.map(p => p.title).join(', ')}</dd></div>
        <div><dt>AI assistant</dt><dd>Reads your files; cannot edit or run code</dd></div>
        <div><dt>Hidden tests</dt><dd>{challenge.hasTests ? 'Run once when you submit' : 'None; scoring uses your explanations'}</dd></div>
      </dl>

      <p className="case-note">The clock starts when you press Start. At zero your work is submitted as it stands.</p>
      <div className="case-actions">
        <button className="cta" onClick={onStart}>Start {duration?.minutes ?? minutes}-minute round</button>
        <button className="ghost" onClick={onBack}>Change time</button>
      </div>
    </section>
  );
}

function PastRounds({ rounds }) {
  const list = rounds.slice(0, 5);
  if (!list.length) return null;
  return (
    <>
      <h2>Your recent rounds</h2>
      <ul className="history">
        {list.map(r => (
          <li key={r.sessionId}>
            <strong>{r.title}</strong>
            <span>{r.minutes ? `${r.minutes} min · ` : ''}{new Date(r.at).toLocaleDateString()} · {r.score == null ? 'not scored' : `${r.score} / 100`}{r.testsTotal ? ` · ${r.testsPassed}/${r.testsTotal} tests` : ''}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Landing({ user, rounds = [], onStart, onLogout }) {
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [drawn, setDrawn] = useState(() => findChallenge(new URLSearchParams(location.search).get('case')) || findChallenge(read()) || null);
  const [phase, setPhase] = useState(drawn ? 'brief' : 'pick'); // pick -> reel -> brief

  function draw() {
    const choice = drawChallenge(recentCases());
    write(choice.id); setDrawn(choice); setPhase('reel');
  }
  function begin() { rememberCase(drawn.id); write(null); onStart(drawn, minutes); }

  if (!challenges.length) return <main className="lobby"><p className="error">No cases are available. Add a reviewed challenge bundle and rebuild.</p></main>;

  return (
    <main className="lobby">
      <header className="lobby-head">
        <span className="wordmark">Codebase Detective</span>
        <span className="lobby-sub">Signed in as <strong>{user.name}</strong></span>
        <button className="ghost small" onClick={onLogout}>Log out</button>
      </header>

      <div className="lobby-grid">
        <div className="lobby-main">
          <h1>Read it.<br />Trace it.<br />Fix it.</h1>
          <p className="lede">You get an unfamiliar codebase with a bug nobody has explained to you, an AI assistant, and a clock. We score how you read, how you debug, and how you check what the AI tells you.</p>

          {phase === 'pick' && (
            <>
              <fieldset className="durations">
                <legend>How long do you want?</legend>
                {DURATIONS.map(d => (
                  <label key={d.minutes} className={`duration ${minutes === d.minutes ? 'on' : ''}`}>
                    <input type="radio" name="minutes" value={d.minutes} checked={minutes === d.minutes} onChange={() => setMinutes(d.minutes)} />
                    <span className="mins">{d.minutes}<small>min</small></span>
                    <span className="dlabel">{d.label}</span>
                    <span className="dblurb">{d.blurb}</span>
                  </label>
                ))}
              </fieldset>
              <button className="cta" onClick={draw}>Draw my case</button>
              <p className="fine">Your case is picked at random from {challenges.length} codebases. Progress is saved in this browser only.</p>
            </>
          )}

          {phase === 'reel' && drawn && (
            <div className="drawing" role="status">
              <p className="drawing-label">Assigning your case</p>
              <Reel target={drawn} onDone={() => setPhase('brief')} />
            </div>
          )}

          {phase === 'brief' && drawn && (
            <Briefing challenge={drawn} minutes={minutes} onStart={begin} onBack={() => setPhase('pick')} />
          )}
        </div>

        <aside className="lobby-side" aria-label="How a round works">
          <h2>How a round works</h2>
          <ol className="steps">
            {STEPS.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}
          </ol>
          <PastRounds rounds={rounds} />
          <h2>What you are scored on</h2>
          <ul className="criteria">
            <li><strong>Code reading</strong> tracing what the code actually does</li>
            <li><strong>Debugging</strong> hypothesis first, then evidence</li>
            <li><strong>AI fluency</strong> precise questions, verified answers</li>
            <li><strong>Communication</strong> explaining your reasoning</li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
