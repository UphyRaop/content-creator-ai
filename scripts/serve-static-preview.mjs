import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const documentRoot = await realpath(path.join(projectRoot, 'dist'));
const certificatePath = process.env.CCAI_TEST_TLS_CERT;
const privateKeyPath = process.env.CCAI_TEST_TLS_KEY;
if (!certificatePath || !privateKeyPath) {
  throw new Error('Set CCAI_TEST_TLS_CERT and CCAI_TEST_TLS_KEY to ephemeral test certificate files.');
}

const certificate = await readFile(certificatePath);
const privateKey = await readFile(privateKeyPath);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const server = https.createServer({ cert: certificate, key: privateKey }, async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', 'https://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(documentRoot, relativePath);
  if (candidate !== documentRoot && !candidate.startsWith(documentRoot + path.sep)) {
    response.writeHead(404).end('Not found');
    return;
  }

  try {
    const filePath = await realpath(candidate);
    if (filePath !== documentRoot && !filePath.startsWith(documentRoot + path.sep)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const details = await stat(filePath);
    if (!details.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Length': details.size,
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(4173, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
