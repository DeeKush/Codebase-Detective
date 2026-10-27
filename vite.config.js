import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function apiPlugin() {
  return {
    name: 'api-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const endpoint = url.pathname.replace(/^\/api\//, '');
        if (endpoint !== 'chat' && endpoint !== 'assess') return next();

        try {
          const buffers = [];
          for await (const chunk of req) buffers.push(chunk);
          const raw = Buffer.concat(buffers).toString('utf8');
          let body = {};
          try { body = raw ? JSON.parse(raw) : {}; } catch {}

          const customRes = {
            statusCode: 200,
            status(code) {
              this.statusCode = code;
              return this;
            },
            json(data) {
              res.statusCode = this.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            }
          };

          const handler = endpoint === 'chat'
            ? (await import('./api/chat.js')).default
            : (await import('./api/assess.js')).default;

          await handler({ ...req, method: req.method, body }, customRes);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'Internal error' }));
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
