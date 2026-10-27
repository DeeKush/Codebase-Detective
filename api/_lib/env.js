import fs from 'node:fs';
import path from 'node:path';

// Local development: read .env.local / .env from the web folder. Variables already set (Vercel, CI) always win.
for (const name of ['.env.local', '.env']) {
  const file = path.resolve(process.cwd(), name);
  try {
    if (!fs.existsSync(file)) continue;
    if (typeof process.loadEnvFile === 'function') process.loadEnvFile(file);
    else for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_0-9]+)\s*=\s*(.*?)\s*$/);
      if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* unreadable env file: fall back to the real environment */ }
}
