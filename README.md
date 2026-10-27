# Codebase Detective (web)

Browser version of the interview lab: Monaco editor, fixed tests in a Web Worker, an AI coach, and an evidence-backed report. Everything it needs lives in this folder.

## Run locally
1. `npm install`
2. Create `.env.local` containing `GROQ_API_KEY=<your key>` (optional `GROQ_MODEL`, default `openai/gpt-oss-120b`).
3. `vercel dev --listen 3000` and open http://localhost:3000. Plain `npm run dev` serves only the UI; the `/api` routes need `vercel dev`.
4. `npm test` runs the harness and API tests; `npm run build` builds `dist/`.

## Deploy
Import the repo in Vercel with **Root Directory = `web`** and set `GROQ_API_KEY`.

## Layout
- `src/` React app, test runner worker, scoring. `src/challenge/` holds the challenge files.
- `api/chat.js`, `api/assess.js` Vercel functions; the only code that sees the Groq key.
- Progress is saved in the browser's localStorage. Test results are computed client-side, so this is a demo-grade trust model with no rate limiting.

## How a round works
- Sign up or log in (accounts are device-local: salted PBKDF2 hashes in this browser's storage, no server).
- Pick 10, 30 or 60 minutes (1, 2 or 3 phases). A case is drawn at random from `src/challenges/` and the clock starts when you press Start. `?case=<id>` forces a case for testing.
- Each challenge folder holds `meta.json`, `files/` (what the candidate sees), and for `"runner": "suite"` challenges `hidden/` tests and `reference.patch`. `npm test` checks that every suite challenge is fair: visible tests pass, hidden tests catch the bug, the patch fixes it.
- `scripts/ingest.mjs` turns open-source bug-fix commits into new bundles (`reviewed: false` until a human approves them).
