/**
 * A local HTTP server for probes that exercise the app's own picture fetch.
 *
 * It binds an ephemeral port on loopback and answers a small fixed set of paths: a PNG, an SVG,
 * a webp, a redirect, a missing page and a response with no content type. The probe gets the base
 * URL through `window.__probeHttpBase`; nothing leaves the machine.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const png = readFileSync(new URL('../src-tauri/icons/32x32.png', import.meta.url));
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60">' +
    '<rect width="120" height="60" fill="#3b82f6"/>' +
    '<circle cx="60" cy="30" r="20" fill="#f59e0b"/></svg>'
);
const webp = Buffer.from(
  'UklGRh4AAABXRUJQVlA4TBEAAAAvAUEAAAdQwe7Uvv+BiOh/AAA=',
  'base64'
);

export async function startHttpFixture() {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://fixture').pathname;
    if (path === '/redirect') {
      response.writeHead(302, { location: '/image.png' });
      response.end();
      return;
    }
    if (path === '/missing') {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not here');
      return;
    }
    if (path === '/image.svg') {
      response.writeHead(200, { 'content-type': 'image/svg+xml' });
      response.end(svg);
      return;
    }
    if (path === '/image.webp') {
      response.writeHead(200, { 'content-type': 'image/webp' });
      response.end(webp);
      return;
    }
    if (path === '/image.png') {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(png);
      return;
    }
    if (
      path.startsWith('/revealjs/dist/') ||
      path.startsWith('/revealjs/plugin/')
    ) {
      const type = path.endsWith('.css') ? 'text/css' : 'text/javascript';
      response.writeHead(200, { 'content-type': type });
      response.end(`/* local Reveal.js fixture: ${path} */\n`);
      return;
    }
    if (path === '/no-type') {
      response.writeHead(200);
      response.end(png);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not here');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  const address = server.address();
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => server.close()
  };
}
