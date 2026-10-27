# Submission kit

## Form answers (copy into https://forms.gle/sBy4sfqyiRG2Zpom9)

- **Project Name:** Codebase Detective
- **Student Name:** <your name>
- **Problem Statement:** Interviews test writing fresh code, but real work is reading unfamiliar code, finding the bug and deciding how far to trust an AI assistant. Codebase Detective runs a timed code-comprehension round and produces an evidence-backed report on how the candidate read, debugged, used the AI and explained their reasoning.
- **GitHub Repository:** https://github.com/suryawanshiheramb11/deepak
- **Deployed Application / Build:** <Vercel URL>
- **Demo Video:** <link>
- **Tech Stack:** React, Vite, Monaco, Web Workers, Vercel Serverless Functions, Groq (gpt-oss-120b, structured output), WebCrypto PBKDF2, Node test runner
- **Major Features:** accounts and saved rounds; random time-boxed case assignment (10/30/60 min); hidden-test execution in a Web Worker; AI coach with server-side key; schema-validated, evidence-cited scoring report.

## Demo video script (about 4 minutes)

1. (0:00) The problem, in one sentence: interviews do not test reading code or supervising an AI.
2. (0:20) Sign up with a new account. Show one error first (a weak password) so validation is visible.
3. (0:45) Pick 10 minutes, press Draw my case, show the shuffle landing on a case, read the briefing, press Start.
4. (1:15) In the editor: open BUG_REPORT.md, run the visible tests (they pass), say your hypothesis out loud (Narrate on), then ask the AI coach one precise question.
5. (2:15) Fix the bug, add a regression test, run tests.
6. (2:45) Submit, fill the written answers, show the report: hidden tests, rubric scores, cited evidence.
7. (3:30) Log out and log back in to show saved rounds; mention the limits (device-local accounts).

## Pre-submit checklist

- [ ] Vercel project has `GROQ_API_KEY` set and the deployment URL works in a private window
- [ ] README top has the deployed URL and video link
- [ ] Repository is public (open it in a private window)
- [ ] Video link opens without requesting access
- [ ] Form submitted before 27 Oct 2026, 11:59 PM IST
