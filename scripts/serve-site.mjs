/**
 * Serves the generated public site for desktop and mobile visual checks.
 *
 * Example: `npm run site:build && npm run site:preview` opens the same relative URLs used on
 * GitHub Pages, where the project is mounted below `/yi/`.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize } from 'node:path';

const root = new URL('../_site/', import.meta.url);
const port = Number(process.env.YI_SITE_PORT ?? 1430);
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

createServer(async (request, response) => {
  const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = normalize(requested === '/' ? 'index.html' : requested.slice(1));
  const file = new URL(relative, root);
  try {
    const body = await readFile(file);
    if (!file.href.startsWith(root.href)) throw new Error('outside the site');
    response.writeHead(200, {
      'content-type': types[extname(file.pathname)] ?? 'application/octet-stream'
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Yi site: http://127.0.0.1:${port}/`);
});
