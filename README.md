# Codebase Detective

A timed code-comprehension interview. A candidate gets an unfamiliar codebase with a bug nobody has explained, an AI assistant, and a clock. The app measures how they read code, debug, use the AI and explain their reasoning, then produces an evidence-backed report.

This folder is the whole product and runs on its own: nothing outside `web/` is needed to install, test, run or deploy it.

- **Live Web Application (Vercel)**: [https://codebase-detective-eta.vercel.app](https://codebase-detective-eta.vercel.app)
- **Backend API Service (Render)**: [https://codebase-detective-b38g.onrender.com](https://codebase-detective-b38g.onrender.com)
- **GitHub Repository**: [https://github.com/DeeKush/Codebase-Detective](https://github.com/DeeKush/Codebase-Detective)
- **Demo Video**: *(Link to be added once recorded)*

## Problem statement

Hiring tests usually ask people to write fresh code on a blank page. Real work is mostly reading code someone else wrote, finding what is wrong, and deciding how far to trust an AI assistant. Take-homes and puzzles do not measure that, and interviewers have no record of *how* the candidate worked.

## Target users

- Candidates and students practising code reading and debugging under time pressure, with feedback on how they used the AI.
- Interviewers and training programs that want a repeatable code-comprehension round with a scored report.

## Solution and key features

1. **Accounts and saved rounds.** Sign up and log in with email or Google (scrypt-hashed passwords, HttpOnly signed cookies). The in-progress round is saved to the server, restored after a reload or on another device, and finished rounds appear in a history list.
2. **Random, time-boxed assignment.** A case is drawn at random from 8 codebases (recent ones are avoided). The candidate picks 10, 30 or 60 minutes; shorter rounds cover fewer phases (Bug Fix, then Regression Test, then Review). Time running out submits the work automatically.
3. **Real test execution.** The tests the candidate can see run in a Web Worker with a purpose-built mocha-style runner. Hidden tests, including the one that exposes the bug, run on the server in an isolated Vercel Sandbox (no network, no secrets) when the round is submitted.
4. **AI coach with limits.** The assistant reads the candidate's files through a server endpoint, so the key never reaches the browser. It cannot edit or run code, and every prompt becomes evidence.
5. **Evidence-backed report.** Four criteria (code reading, debugging, AI fluency, communication) are scored under a strict JSON schema. The server rejects scores out of range, unknown evidence ids, and positive scores without evidence, and accepts hidden-test results only with its own signature.
6. **Narration and timeline.** Optional voice-to-text or typed notes merged with AI prompts and phase changes.

## Tech stack

React 18 + Vite, Monaco editor, Web Workers, Vercel Serverless Functions (Node 22), Upstash Redis, Vercel Sandbox, Groq (`openai/gpt-oss-120b`, structured output), Node `crypto` (scrypt, HMAC), Node's built-in test runner.

## Architecture

```
Browser (React)
 ├─ Welcome / Landing ── auth.js ──▶ /api/auth/{signup,login,logout,me}
 ├─ challenges/*  (bundled: files/ and public meta only)
 ├─ App (editor, explorer, chat, timeline, timer) ── session.js ──▶ localStorage cache + PUT /api/state
 ├─ runner.js ──▶ runner.worker.js ──▶ testkit.js          visible tests, in the browser
 ├─ POST /api/grade   ──▶ Vercel Sandbox (no network)      hidden tests, on the server
 ├─ POST /api/chat    ──▶ Groq                             AI coach
 └─ POST /api/assess  ──▶ Groq                             rubric; records the finished round

api/            Vercel functions. _lib/ holds auth (scrypt, HMAC cookies), store (Redis / file / memory),
                grader (Sandbox or worker), challenge loader, rate limits.
src/challenges/ One folder per case: meta.json, files/ (shown to the candidate), and server-only hidden/,
                reference.patch, grading.json.
scripts/        ingest.mjs turns open-source bug-fix commits into new case bundles (reviewed:false until approved).
tests/          37 tests: runner, auth, API, grading, scoring, and a check that every case is fair and no hidden test text is in the browser bundle.
```

## Local setup

```bash
npm install
cp .env.example .env.local      # then fill GROQ_API_KEY and AUTH_SECRET (see below)
npm run dev                     # UI and /api routes on http://localhost:3000
npm test                        # 37 tests
npm run build                   # production build in dist/
```

With the database variables left empty, accounts and rounds are kept in `.data/store.json` (git-ignored) and hidden tests run in a worker thread (`GRADER=local`, development only). `?case=lru-cache` forces a specific case.

## Environment variables

Documented in `.env.example`; real values live in `.env.local` (git-ignored) or in Vercel's settings.

| Name | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq key for the AI coach and the report. Server-side only. |
| `AUTH_SECRET` | Yes in production | 16+ random characters; signs session cookies and grading proofs. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Yes in production | Upstash Redis REST URL and token. Empty locally. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No | Enables Sign in with Google (see below). |
| `GRADER` | No | `local` for development only. Leave unset in production to grade in Vercel Sandbox. |
| `GROQ_MODEL` | No | Defaults to `openai/gpt-oss-120b`. |

## Sign in with Google (Google Cloud Console)

The email form always works; the Google button appears only when both Google variables are set.

1. Open [Google Cloud Console](https://console.cloud.google.com/), create or pick a project.
2. **APIs & Services -> OAuth consent screen**: choose *External*, set the app name and support email, add your deployed domain under *Authorized domains*, and set the privacy policy to `https://<your-domain>/privacy.html` and terms to `https://<your-domain>/terms.html`. The scopes `openid`, `email` and `profile` are non-sensitive and need no Google review. Publish the app (or add test users while it is in *Testing*).
3. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID -> Web application**:
   - Authorized JavaScript origins: `https://<your-domain>` and `http://localhost:3000`
   - Authorized redirect URIs: `https://<your-domain>/api/auth/google-callback` and `http://localhost:3000/api/auth/google-callback`
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (`.env.local` locally, Vercel environment variables in production) and redeploy.

The flow is the OAuth 2.0 authorization-code flow on the server: a random `state` is bound to the browser by a short-lived HttpOnly cookie, the code is exchanged server-side with the client secret, and the ID token's issuer, audience, expiry and `email_verified` are checked before a session cookie is issued. Google tokens are not stored.

## Deployment

1. Create a free Upstash Redis database (Vercel Marketplace: `vercel integration add upstash/upstash-kv`, or the Upstash console) and copy its REST URL and token.
2. In Vercel, import this repository with **Root Directory = `web`**.
3. Add `GROQ_API_KEY`, `AUTH_SECRET`, `KV_REST_API_URL` and `KV_REST_API_TOKEN` (and the two Google variables, if you want Google sign-in) as environment variables, then deploy.

`vercel.json` already bundles the case data into the functions and sets security headers.

## Limitations

- Hidden tests run in a Vercel Sandbox with networking disabled and no secrets, and only test ids and pass/fail leave it. The candidate's code and the assertions share one process inside that sandbox, so a determined candidate could try to tamper with their own result there.
- The original `retry-queue` case is still graded in the browser and its report marks those results as unverified.
- `npm audit` reports advisories in two transitive dependencies with no non-breaking fix: DOMPurify (pulled in by the optional `monaco-editor` package; it is not in the shipped bundle, because the editor is loaded from the CDN at runtime) and zod (inside `@vercel/sandbox`, server-side, never fed user-controlled schemas).
- The rate limiter is in memory per serverless instance. There is no email verification or password reset.

## Credits

All eight codebases are written for this project. The ingest script follows the idea behind public benchmarks such as SWE-bench (fix commit's parent plus tests that flip) but shares no code with them. Libraries: React, Vite, Monaco, `@vercel/sandbox`.
