/* global process, URL */
// A loopback release origin for the browser tests (Phase 18B): serves the
// fixture channel under e2e/fixtures/release-origin, so the plan the console
// renders is the real API's, computed from a channel the test controls, with
// no dependency on get.nodeau.ai or on what it happens to publish today.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, normalize } from 'node:path';

const root = resolve(import.meta.dirname, 'fixtures/release-origin');
const port = Number(process.env.PORT ?? 8098);

createServer(async (req, res) => {
  const path = normalize(new URL(req.url ?? '/', 'http://x').pathname);
  const file = resolve(root, '.' + path);
  if (!file.startsWith(root + '/')) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
  } catch {
    res.writeHead(path === '/' ? 200 : 404).end();
  }
}).listen(port, '127.0.0.1');
