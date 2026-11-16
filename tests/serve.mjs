// Minimal static file server for the player (serves ./src).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { root } from '../harness/machine.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
};

export function serve(dir = path.join(root, 'src'), port = 0) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.normalize(path.join(dir, url === '/' ? 'dev.html' : url));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { url } = await serve(undefined, Number(process.env.PORT) || 8080);
  console.log(`player on ${url}/dev.html`);
}
