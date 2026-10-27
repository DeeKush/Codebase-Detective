import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Serves the /api functions during `npm run dev` the way Vercel would: same handlers, same (req, res) shape.
function apiPlugin() {
  const routes = { chat: './api/chat.js', assess: './api/assess.js', grade: './api/grade.js', state: './api/state.js' };
  return {
    name: 'api-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const [, , first, second] = url.pathname.split('/');
        const file = first === 'auth' ? './api/auth/[action].js' : routes[first];
        if (!file) return next();
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const raw = Buffer.concat(chunks).toString('utf8');
          let body = {};
          try { body = raw ? JSON.parse(raw) : {}; } catch { /* handlers reject bad bodies */ }
          res.status = code => { res.statusCode = code; return res; };
          res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
          req.body = body;
          req.query = { action: second };
          await (await server.ssrLoadModule(file)).default(req, res);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal error.' }));
          console.error(err);
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
  worker: { format: 'es' },
  server: { fs: { allow: ['..'] } }
});
