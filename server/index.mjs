/* FAME CAFÉ — Server-Einstieg.

   Lauscht nur auf 127.0.0.1: erreichbar ist die API ausschließlich über den
   nginx davor, der auch die Adresse /api/ weiterreicht.

   Umgebungsvariablen
     FAME_ADMIN_TOKEN     Zugangscode für /admin/ (Pflicht, mind. 16 Zeichen)
     DATA_DIR             Speicherort, muss ein persistentes Volume sein (Standard /data)
     FAME_PUBLIC_BASE     z. B. https://example.org — für den Link in Benachrichtigungen
     FAME_NOTIFY_URL      optional: Webhook für neue Anfragen (ntfy, n8n, …)
     FAME_NOTIFY_FORMAT   json (Standard) oder ntfy
     FAME_PROXY_HOPS      Zahl der Proxys vor dem nginx (Coolify/Traefik: 1)
     FAME_API_PORT        interner Port, Standard 3001

   Absichtlich NICHT `PORT`: Coolify setzt PORT auf den nach außen freigegebenen
   Port (3000), auf dem nginx lauscht. Der Dienst griff deshalb live nach 3000,
   scheiterte mit EADDRINUSE und der Container wurde als „unhealthy“ verworfen. */

import { createServer } from 'node:http';
import { createApp } from './app.mjs';

const token = process.env.FAME_ADMIN_TOKEN || '';
if (token && token.length < 16) {
  console.error('FAME_ADMIN_TOKEN ist zu kurz (mindestens 16 Zeichen). Verwaltungsbereich bleibt gesperrt.');
}

const app = createApp({
  dataDir: process.env.DATA_DIR || '/data',
  adminToken: token.length >= 16 ? token : '',
  notifyUrl: process.env.FAME_NOTIFY_URL || '',
  notifyFormat: process.env.FAME_NOTIFY_FORMAT || 'json',
  publicBase: process.env.FAME_PUBLIC_BASE || '',
  proxyHops: Number(process.env.FAME_PROXY_HOPS ?? 1),
  log: msg => console.error(`[fame] ${msg}`)
});

const server = createServer(async (req, res) => {
  if (!(await app.handle(req, res))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  }
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;

const port = Number(process.env.FAME_API_PORT || 3001);
server.listen(port, '127.0.0.1', () => {
  console.log(`[fame] Reservierungs-API auf 127.0.0.1:${port}, Admin ${token.length >= 16 ? 'aktiv' : 'GESPERRT'}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { app.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
}
