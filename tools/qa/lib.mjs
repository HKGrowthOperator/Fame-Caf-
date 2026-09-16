/* Gemeinsame Basis der QA-Werkzeuge.
   Playwright wird zuerst lokal, dann global gesucht — damit die Skripte auch
   laufen, wenn Playwright global installiert ist und nicht im Projekt. */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';

export const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');

export const PAGES = ['index.html', 'impressum.html', 'datenschutz.html', '404.html'];

export const VIEWPORTS = [
  { name: 'w320', width: 320, height: 700 },
  { name: 'w390', width: 390, height: 844 },
  { name: 'w500', width: 500, height: 900 },
  { name: 'w660', width: 660, height: 900 },
  { name: 'w740', width: 740, height: 900 },
  { name: 'w834', width: 834, height: 1112 },
  { name: 'w900', width: 900, height: 800 },
  { name: 'w1050', width: 1050, height: 820 },
  { name: 'w1200', width: 1200, height: 860 },
  { name: 'w1440', width: 1440, height: 900 },
  { name: 'w1600', width: 1600, height: 900 }
];

export async function loadChromium() {
  let mod;
  try {
    mod = await import('playwright');
  } catch {
    try {
      const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
      mod = await import(join(globalRoot, 'playwright', 'index.mjs'));
    } catch {
      console.error('Playwright fehlt. Einmalig einrichten:\n  npm install\n  npx playwright install chromium');
      process.exit(2);
    }
  }
  const launchOptions = {};
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  return mod.chromium.launch(launchOptions);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

/** Statischer Server über dem Projektverzeichnis. Liefert 404.html bei 404 —
 *  wie die nginx-Konfiguration im Betrieb. */
export function serve(port = 8099) {
  const server = createServer(async (req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    try {
      if ((await stat(file)).isDirectory()) throw new Error('dir');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      try {
        const body = await readFile(join(ROOT, '404.html'));
        res.writeHead(404, { 'Content-Type': TYPES['.html'] });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise(r => server.close(r))
  })));
}

export function report(name, failures, passedCount) {
  if (failures.length) {
    console.error(`\n${name}: ${failures.length} Problem(e)\n- ` + failures.join('\n- '));
    process.exitCode = 1;
  } else {
    console.log(`${name}: bestanden (${passedCount} Prüfungen)`);
  }
}
