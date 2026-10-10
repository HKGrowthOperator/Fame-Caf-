import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

/* Coolify setzt PORT auf den Port, auf dem nginx lauscht (3000). Der Dienst las PORT,
   wollte denselben Port, scheiterte mit EADDRINUSE und der Container fiel durch den
   Healthcheck. Dieser Test hält den belegten PORT nach und erwartet, dass der Dienst
   trotzdem auf seinem eigenen Port startet. */
test('Dienst ignoriert PORT (gehört nginx) und lauscht auf FAME_API_PORT', async () => {
  const busy = createServer();
  await new Promise(r => busy.listen(0, '127.0.0.1', r));
  const nginxPort = busy.address().port;
  const apiPort = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), 'fame-idx-'));
  const child = spawn(process.execPath, [new URL('../index.mjs', import.meta.url).pathname], {
    env: { ...process.env, PORT: String(nginxPort), FAME_API_PORT: String(apiPort), DATA_DIR: dataDir, FAME_ADMIN_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  try {
    let res;
    for (let i = 0; i < 50 && !res; i++) {
      await new Promise(r => setTimeout(r, 100));
      res = await fetch(`http://127.0.0.1:${apiPort}/api/config`).catch(() => null);
    }
    assert.ok(res, `Dienst antwortet nicht auf FAME_API_PORT. Ausgabe:\n${out}`);
    assert.equal(res.status, 200);
    assert.doesNotMatch(out, /EADDRINUSE/);
  } finally {
    child.kill('SIGTERM');
    await new Promise(r => busy.close(r));
    rmSync(dataDir, { recursive: true, force: true });
  }
});
