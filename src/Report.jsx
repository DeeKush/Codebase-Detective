import React from 'react';
import { score, testLabel } from './score.js';
import { saveSession } from './session.js';

const LABELS = { codeReading: 'Code reading', debugging: 'Debugging', aiFluency: 'AI fluency', communication: 'Communication' };
const fmt = s => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;

export default function Report({ session, challenge, onRetry, busy, error }) {
  const { submission, report } = session;
  const run = submission.finalRun;
  const points = run?.tests ? score(run.tests, run.status, challenge) : null;
  return (
    <main className="report">
      <h1>Interview report</h1>
      <p className="muted">{challenge.title} · submitted after {fmt((submission.submittedAt - session.startedAt) / 1000)}</p>
      <section>
        <h2>Phases</h2>
        {session.phases.map(p => <p key={p.id}>{p.completedAt ? '✓' : '○'} {p.title}: {p.completedAt ? fmt((p.completedAt - p.startedAt) / 1000) : p.startedAt ? 'not completed' : 'not started'}</p>)}
        {run && (
          <>
            <h3>Test results {points ? `(${points.passedPoints}/${points.totalPoints} points)` : ''}</h3>
            {run.tests ? run.tests.map(t => <p key={t.id} className={t.outcome === 'passed' ? 'good' : 'error'}>{t.outcome === 'passed' ? '✓' : '✗'} {testLabel(challenge, t.id)}</p>) : <p className="error">{run.diagnostic}</p>}
          </>
        )}
      </section>
      <section>
        <h2>Rubric {report && <span className="muted">· {report.overallScore} / 100</span>}</h2>
        {report ? (
          <>
            <p>{report.summary}</p>
            {report.criteria.map(c => (
              <div className="criterion" key={c.id}>
                <strong>{LABELS[c.id]}</strong>: {c.points} / 25 <span className="muted">({c.confidence} confidence)</span>
                <p>{c.rationale}</p>
                <p className="muted">Evidence: {c.evidenceIds.join(', ') || 'none'}</p>
              </div>
            ))}
            {[['Strengths', report.strengths], ['Improvements', report.improvements], ['Practice exercises', report.exercises], ['Limitations', report.limitations]].map(([title, list]) => list.length > 0 && (
              <div key={title}><h3>{title}</h3><ul>{list.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
            ))}
          </>
        ) : (
          <>
            <p className="muted">{busy ? 'Scoring your session…' : 'The AI rubric score is not available yet.'}</p>
            {error && <p className="error">{error}</p>}
            <button onClick={onRetry} disabled={!!busy}>{busy ? 'Scoring…' : 'Generate rubric score'}</button>
          </>
        )}
      </section>
      <button className="secondary" onClick={() => { saveSession(null); location.reload(); }}>Start a new interview</button>
    </main>
  );
}
