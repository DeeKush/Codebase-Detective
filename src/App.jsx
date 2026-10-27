import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { findChallenge } from './challenges/index.js';
import { score, testLabel } from './score.js';
import { runTests } from './runner.js';
import { askAssistant, assess, gradeSubmission, fetchState, setUnauthorizedHandler } from './api.js';
import { loadSession, saveSession, newSession, setSessionOwner, mergeRemoteSession, flushSessionNow } from './session.js';
import Landing from './Landing.jsx';
import Welcome from './Welcome.jsx';
import { currentUser, logOut } from './auth.js';
import FileTree from './FileTree.jsx';
import Report from './Report.jsx';
import { useNarration } from './useNarration.js';

const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const stamp = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const summarize = run => run.tests ? run.tests.map(t => `${t.id}=${t.outcome}`).join(', ') : run.diagnostic;
const EDITOR_FONT = "'JetBrains Mono','Fira Code',ui-monospace,Menlo,monospace";
// Mimics a plain interview editor: no autocomplete or inline hints.
const EDITOR_OPTIONS = { minimap: { enabled: false }, fontSize: 14, fontFamily: EDITOR_FONT, fontLigatures: true, automaticLayout: true, scrollBeyondLastLine: false, quickSuggestions: false, suggestOnTriggerCharacters: false, parameterHints: { enabled: false }, wordBasedSuggestions: 'off', acceptSuggestionOnEnter: 'off', tabCompletion: 'off', inlineSuggest: { enabled: false } };

function Message({ text }) {
  // React escapes text; only fenced code blocks get special rendering.
  return text.split(/```(?:\w+)?\n?/).map((part, i) => i % 2 ? <pre key={i}>{part}</pre> : <p key={i}>{part}</p>);
}

function TestList({ run, challenge }) {
  if (!run) return <p className="muted">No test run yet.</p>;
  if (!run.tests) return <p className="error">{run.diagnostic}</p>;
  const points = challenge.runner === 'suite' ? null : score(run.tests, run.status);
  const passing = run.tests.filter(t => t.outcome === 'passed').length;
  return (
    <div>
      <p><strong>{challenge.runner === 'suite' ? `${passing}/${run.tests.length} tests passing` : points ? `${points.passedPoints}/${points.totalPoints} points` : 'Run incomplete'}</strong></p>
      {run.tests.map(t => (
        <details key={t.id} open={t.outcome !== 'passed'}>
          <summary className={t.outcome}>{t.outcome === 'passed' ? '✓' : '✗'} {testLabel(challenge, t.id)}</summary>
          {t.message && <pre>{t.message}</pre>}
        </details>
      ))}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [rounds, setRounds] = useState([]);
  const [session, setSession] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(null);
  const [model, setModel] = useState('');
  const [tab, setTab] = useState('chat');
  const [diff, setDiff] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [narrate, setNarrate] = useState(false);
  const [note, setNote] = useState('');
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('codebaseDetective.theme') || 'dark'; } catch { return 'dark'; } });
  const editorRef = useRef(null), chatEnd = useRef(null), submitting = useRef(false);

  const challenge = session && findChallenge(session.challengeId);
  const running = session?.status === 'RUNNING';
  const remaining = session ? session.deadlineAt - now : 0;
  const elapsed = () => (Date.now() - session.startedAt) / 1000;
  const update = patch => setSession(old => { const next = { ...old, ...(typeof patch === 'function' ? patch(old) : patch) }; saveSession(next); return next; });

  async function enter(u) {
    setSessionOwner(u.email);
    const local = loadSession();
    setUser(u); setSession(local);
    try {
      const state = await fetchState();
      setRounds(state.rounds);
      setSession(mergeRemoteSession(local, state.session));
    } catch { /* offline: the cached local round is used */ }
  }
  function leave() { setUser(null); setSession(null); setRounds([]); setSessionOwner(null); }
  useEffect(() => {
    setUnauthorizedHandler(leave);
    currentUser().then(u => u && enter(u)).finally(() => setBooting(false));
  }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('codebaseDetective.theme', theme); } catch { /* ignore */ } }, [theme]);

  const addNarration = (text, source = 'voice') => update(old => ({ narration: [...old.narration, { at: Date.now(), t: (Date.now() - old.startedAt) / 1000, text, source }] }));
  const speech = useNarration(narrate && running, text => addNarration(text, 'voice'));

  const visibleChat = useMemo(() => session ? session.chat.filter(c => c.at > session.chatClearedAt) : [], [session]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [visibleChat.length, pending, tab]);

  const timeline = useMemo(() => {
    if (!session) return [];
    const events = [
      ...session.narration.map(n => ({ at: n.at, kind: 'narration', label: n.source === 'voice' ? 'Narration' : 'Note', text: n.text })),
      ...session.chat.map(c => ({ at: c.at, kind: 'ai', label: 'Asked AI', text: c.question })),
      ...session.phases.flatMap(p => [p.startedAt && { at: p.startedAt, kind: 'phase', label: 'Phase started', text: p.title }, p.completedAt && { at: p.completedAt, kind: 'phase', label: 'Phase completed', text: p.title }].filter(Boolean))
    ];
    return events.sort((a, b) => a.at - b.at);
  }, [session]);

  // Suite challenges are graded on the server (hidden tests, isolated sandbox); a failure here is recorded and retried when the report is generated.
  async function finalGrade(files) {
    if (challenge.runner !== 'suite') return runTests(files, challenge);
    const startedAt = Date.now();
    try { return { id: crypto.randomUUID(), startedAt, finishedAt: Date.now(), ...(await gradeSubmission({ challengeId: challenge.id, files })) }; }
    catch (e) { return { id: crypto.randomUUID(), startedAt, finishedAt: Date.now(), status: 'failed', tests: null, diagnostic: e.message }; }
  }

  async function submit() {
    if (submitting.current) return;
    submitting.current = true; setShowSubmit(false); setBusy('Submitting…'); setError('');
    try {
      const finalRun = challenge.hasTests ? await finalGrade(session.files) : null;
      const phases = session.phases.map((p, i) => i === session.phase && !p.completedAt && p.startedAt ? { ...p, completedAt: Date.now() } : p);
      update({ status: 'COMPLETED', phases, submission: { files: session.files, finalRun, submittedAt: Date.now() } });
    } finally { submitting.current = false; setBusy(''); }
  }
  useEffect(() => { if (running && remaining <= 0) void submit(); }, [running, remaining <= 0]);

  async function generateReport() {
    setBusy('Scoring…'); setError('');
    try {
      let { submission } = session;
      if (challenge.runner === 'suite' && !submission.finalRun?.tests) {
        submission = { ...submission, finalRun: await finalGrade(submission.files) };
        update({ submission });
        if (!submission.finalRun.tests) throw new Error(submission.finalRun.diagnostic || 'The hidden tests could not be run.');
      }
      const { answers, chat, narration, phases, startedAt } = session;
      const { report } = await assess({
        challengeId: challenge.id, sessionId: session.id, minutes: session.minutes, proof: submission.finalRun?.proof,
        answers, baseline: challenge.files, files: submission.files,
        tests: (submission.finalRun?.tests || []).map(t => ({ id: t.id, outcome: t.outcome, description: testLabel(challenge, t.id) })),
        phases: phases.map(p => ({ title: p.title, status: p.completedAt ? 'completed' : 'incomplete', seconds: p.completedAt ? (p.completedAt - p.startedAt) / 1000 : 0 })),
        narration: narration.map(n => ({ t: n.t, text: n.text })),
        chat: chat.map(c => ({ t: (c.at - startedAt) / 1000, mode: c.mode, question: c.question, answer: c.answer }))
      });
      update({ report });
      fetchState().then(state => setRounds(state.rounds)).catch(() => {});
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }
  useEffect(() => { if (session?.status === 'COMPLETED' && !session.report && !busy) void generateReport(); }, [session?.status]);

  async function run() {
    setBusy('Running tests…'); setError('');
    const result = await runTests(session.files, challenge);
    update(old => ({ runs: [...old.runs, result] }));
    setBusy('');
  }

  async function ask() {
    const text = question.trim();
    if (!text || pending) return;
    const editor = editorRef.current;
    const selection = editor && !diff ? editor.getModel().getValueInRange(editor.getSelection()) : '';
    setError(''); setQuestion(''); setPending({ question: text, file: session.active });
    try {
      const history = visibleChat;
      const result = await askAssistant({ mode: 'investigate', question: text, file: session.active, code: session.files[session.active], files: session.files, selection, history });
      setModel(result.model || '');
      update(old => ({ chat: [...old.chat, { id: crypto.randomUUID(), at: Date.now(), mode: 'investigate', question: text, answer: result.answer, file: old.active }] }));
    } catch (e) { setError(e.message); setQuestion(text); } finally { setPending(null); }
  }

  function completePhase() {
    if (session.phase === session.phases.length - 1) { setShowSubmit(true); return; }
    update(old => ({ phase: old.phase + 1, phases: old.phases.map((p, i) => i === old.phase ? { ...p, completedAt: Date.now() } : i === old.phase + 1 ? { ...p, startedAt: Date.now() } : p) }));
  }
  const open = path => update(old => ({ active: path, openTabs: old.openTabs.includes(path) ? old.openTabs : [...old.openTabs, path] }));
  const closeTab = path => update(old => { const tabs = old.openTabs.filter(t => t !== path); return { openTabs: tabs, active: old.active === path ? tabs.at(-1) ?? Object.keys(old.files)[0] : old.active }; });

  const changed = useMemo(() => new Set(session ? Object.keys(session.files).filter(f => session.files[f] !== challenge.files[f]) : []), [session, challenge]);
  const lang = path => path.endsWith('.md') ? 'markdown' : path.endsWith('.json') ? 'json' : 'javascript';

  if (booting) return <main className="lobby"><p className="lede" role="status">Loading…</p></main>;
  if (!user) return <Welcome onAuth={enter} />;
  if (!session) return <Landing user={user} rounds={rounds} onLogout={async () => { flushSessionNow(); await logOut(); leave(); }} onStart={(c, minutes) => { const s = newSession(c, minutes); saveSession(s); setSession(s); }} />;
  if (session.status === 'COMPLETED') return <Report session={session} challenge={challenge} onRetry={generateReport} busy={busy} error={error} />;

  const phase = session.phases[session.phase].prompt ? session.phases[session.phase] : challenge.phases[session.phase];
  const phaseSeconds = session.phases[session.phase].startedAt ? (now - session.phases[session.phase].startedAt) / 1000 : 0;
  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs';

  return (
    <div className="app">
      <header className="toolbar">
        <span className={`timer ${remaining < 300000 ? 'low' : ''}`}>⏱ {clock(remaining)}</span>
        <span className="filepath">File: <strong>{session.active}</strong></span>
        <span className="spacer" />
        {challenge.hasTests && <button className="secondary" onClick={run} disabled={!!busy}>Run tests</button>}
        <button className="secondary" onClick={() => setDiff(d => !d)}>{diff ? 'Edit' : 'Diff'}{changed.size ? ` (${changed.size})` : ''}</button>
        <button className="secondary" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? '☀ Light' : '☾ Dark'}</button>
        <button className="primary" onClick={() => setShowSubmit(true)} disabled={!!busy}>Submit</button>
      </header>

      <div className="panels">
        <aside className="explorer">
          <h3>Explorer</h3>
          <FileTree paths={Object.keys(session.files)} active={session.active} changed={changed} onOpen={open} />
          <div className="task">
            <h3>Phase {session.phase + 1} · {phase.title}</h3>
            <p>{phase.prompt}</p>
          </div>
        </aside>

        <section className="editor-pane">
          <div className="tabs" role="tablist">
            {session.openTabs.map(t => (
              <span key={t} className={`etab ${t === session.active ? 'active' : ''}`} role="tab" onClick={() => open(t)}>
                {t.split('/').pop()}{changed.has(t) ? ' ●' : ''}
                <button className="x" aria-label={`Close ${t}`} onClick={e => { e.stopPropagation(); closeTab(t); }}>×</button>
              </span>
            ))}
          </div>
          <div className="monaco">
            {diff ? (
              <DiffEditor theme={monacoTheme} language={lang(session.active)} original={challenge.files[session.active] ?? ''} modified={session.files[session.active]} options={{ ...EDITOR_OPTIONS, readOnly: true, renderSideBySide: true }} />
            ) : (
              <Editor
                theme={monacoTheme} language={lang(session.active)} path={session.active} value={session.files[session.active]}
                onMount={editor => { editorRef.current = editor; }}
                onChange={value => update(old => ({ files: { ...old.files, [old.active]: value ?? '' } }))}
                options={EDITOR_OPTIONS}
              />
            )}
          </div>
          {challenge.hasTests && <div className="results"><TestList run={session.runs.at(-1)} challenge={challenge} /></div>}
        </section>

        <aside className="assistant">
          <div className="chat-head">
            <span className="badge">✦ AI Assistant{model ? ` · ${model.split('/').pop()}` : ''}</span>
            <button className="link" onClick={() => update({ chatClearedAt: Date.now() })} disabled={!visibleChat.length}>Clear</button>
          </div>
          <div className="seg">
            <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Chat</button>
            <button className={tab === 'timeline' ? 'on' : ''} onClick={() => setTab('timeline')}>Timeline ({timeline.length})</button>
          </div>

          {tab === 'chat' ? (
            <>
              <div className="chat">
                {visibleChat.length === 0 && !pending && <p className="muted">The assistant can read your files but cannot edit or run anything. Say what you suspect first, then ask. Check every answer yourself.</p>}
                {visibleChat.map(c => (
                  <div key={c.id} className="turn">
                    <div className="bubble user"><span className="tag">{c.file}</span>{c.question}</div>
                    <div className="msg bot"><span className="avatar">✦</span><div className="bubble bot"><Message text={c.answer} /></div></div>
                  </div>
                ))}
                {pending && (
                  <div className="turn">
                    <div className="bubble user"><span className="tag">{pending.file}</span>{pending.question}</div>
                    <div className="msg bot"><span className="avatar">✦</span><div className="bubble bot thinking"><span className="dots"><i /><i /><i /></span> Thinking…</div></div>
                  </div>
                )}
                {error && <p className="error">{error}</p>}
                <div ref={chatEnd} />
              </div>
              <div className="composer">
                <div className="inputrow">
                  <textarea value={question} maxLength={2000} rows={2} placeholder="Ask about the code…" onChange={e => setQuestion(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }} />
                  <button onClick={ask} disabled={!!pending || !question.trim()} aria-label="Send">↑</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="chat timeline">
                {timeline.length === 0 && <p className="muted">Your narration, notes, AI prompts and phase changes appear here in order.</p>}
                {timeline.map((e, i) => (
                  <div key={i} className={`event ${e.kind}`}>
                    <span className="when">{stamp((e.at - session.startedAt) / 1000)}</span>
                    <span><strong>{e.label}</strong><br />{e.text}</span>
                  </div>
                ))}
                <div ref={chatEnd} />
              </div>
              <div className="composer">
                <div className="inputrow">
                  <textarea value={note} rows={2} maxLength={1000} placeholder={narrate ? 'Listening… or type a note' : 'Type a note about your reasoning'} onChange={e => setNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && note.trim()) { e.preventDefault(); addNarration(note.trim(), 'typed'); setNote(''); } }} />
                  <button onClick={() => { if (note.trim()) { addNarration(note.trim(), 'typed'); setNote(''); } }} disabled={!note.trim()} aria-label="Add note">+</button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      <footer className="statusbar">
        <span className="stepper">
          {session.phases.map((p, i) => (
            <span key={p.id} className={`step ${i === session.phase ? 'now' : i < session.phase ? 'done' : 'locked'}`}>{i < session.phase ? '✓' : i > session.phase ? '🔒' : '●'} {p.title}</span>
          ))}
        </span>
        <span className="muted">Phase time {stamp(phaseSeconds)}</span>
        <button className="secondary small" onClick={completePhase}>{session.phase === session.phases.length - 1 ? 'Finish & submit' : `Complete ${phase.title} ▸`}</button>
        <span className="spacer" />
        <label className={`toggle ${speech.supported ? '' : 'off'}`} title={speech.supported ? 'Voice-to-text narration' : 'Voice input is not supported in this browser; use typed notes'}>
          <input type="checkbox" checked={narrate} disabled={!speech.supported} onChange={e => setNarrate(e.target.checked)} /> Narrate: {narrate ? 'ON' : 'OFF'}
        </label>
        {speech.error && <span className="error">{speech.error}</span>}
        <button className="secondary small" disabled title="Hints are disabled in this round">Hint (disabled)</button>
      </footer>

      {busy && <div className="toast">{busy}</div>}
      {showSubmit && (
        <div className="modal"><div className="dialog">
          <h2>Submit your solution</h2>
          <p className="muted">Explain your reasoning. These answers are scored together with your code changes, narration and AI conversation.</p>
          {[['rootCause', 'What bugs or root causes did you find, and how did you trace them?'], ['implementation', 'What did you implement or change, and why?'], ['verification', 'How did you verify your work without relying on the AI?'], ['aiSupervision', 'How did you use the AI, and what did you catch or reject?']].map(([key, label]) => (
            <label key={key}>{label}
              <textarea value={session.answers[key]} maxLength={3000} onChange={e => update(old => ({ answers: { ...old.answers, [key]: e.target.value } }))} />
            </label>
          ))}
          <div className="row">
            <button className="secondary" onClick={() => setShowSubmit(false)}>Keep working</button>
            <button className="primary" onClick={submit}>Submit final</button>
          </div>
        </div></div>
      )}
    </div>
  );
}
