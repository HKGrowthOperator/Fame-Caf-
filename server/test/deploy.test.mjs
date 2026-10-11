import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

/* Der Healthcheck rief /api/config ab. Als nginx die Reservierung abschaltete und
   /api/config mit 410 beantwortete, fiel jeder neue Container durch den Healthcheck,
   und Coolify behielt still die alte Version. Diese Prüfung hält beides auseinander. */
test('Healthcheck fragt keine Adresse ab, die nginx sperrt', () => {
  const blocked = [...read('deploy/coolify/nginx.conf').matchAll(/location\s*=\s*(\/\S+)\s*\{\s*return\s+(4\d\d|5\d\d)/g)].map(m => m[1]);
  for (const file of ['Dockerfile', 'deploy/coolify/Dockerfile']) {
    const hc = /HEALTHCHECK[\s\S]*?CMD ([^\n]+)/.exec(read(file));
    assert.ok(hc, `${file}: kein HEALTHCHECK`);
    const paths = [...hc[1].matchAll(/127\.0\.0\.1:3000(\/[^\s>]*)/g)].map(m => m[1]);
    assert.ok(paths.includes('/api/health'), `${file}: Healthcheck prüft den Dienst nicht über /api/health (${paths})`);
    for (const p of paths) assert.ok(!blocked.includes(p), `${file}: Healthcheck fragt ${p} ab, das nginx sperrt`);
  }
});
