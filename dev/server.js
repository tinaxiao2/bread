/* Local preview server. Serves the repository as a static site, adds the stand-in for the
   Claude artifact runtime to the page, and keeps uploaded photos in memory at /_blob/<id>
   so the app's photo paths work the way they do in the published artifact.

   node dev/server.js            -> http://localhost:4173 */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
// 2x2 warm-brown PNG for photos that tests seed without uploading
const SEED_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGPceNSKgYGBiYGBgYGBAQAWmgGBN6TQVQAAAABJRU5ErkJggg==', 'base64');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2'
};

function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function start(port = 4173) {
  const blobs = new Map();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/_blob' && req.method === 'POST') {
        const id = crypto.randomBytes(16).toString('hex');
        blobs.set(id, { type: req.headers['content-type'] || 'application/octet-stream', data: await body(req) });
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ id }));
      }
      if (url.pathname.startsWith('/_blob/')) {
        const id = url.pathname.slice(7);
        if (req.method === 'DELETE') { blobs.delete(id); res.writeHead(204); return res.end(); }
        const blob = blobs.get(id);
        if (!blob && id.startsWith('seed')) {                  // photos named in test fixtures: a plain picture
          res.writeHead(200, { 'content-type': 'image/png' });
          return res.end(SEED_PNG);
        }
        if (!blob) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': blob.type, 'cache-control': 'no-store' });
        return res.end(blob.data);
      }
      const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const file = path.normalize(path.join(ROOT, rel));
      if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
      let data = await fs.readFile(file);
      if (rel === '/index.html') {
        data = data.toString().replace('<head>', '<head>\n<script src="/dev/claude-stub.js"></script>');
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, blobs, url: 'http://127.0.0.1:' + server.address().port }));
  });
}

module.exports = { start };

if (require.main === module) {
  start(Number(process.env.PORT) || 4173).then((s) => console.log('Let\'s Get This (local stand-in storage): ' + s.url));
}
