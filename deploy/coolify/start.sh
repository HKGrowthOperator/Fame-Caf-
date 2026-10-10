#!/bin/sh
# FAME CAFÉ — Containerstart: Reservierungsdienst (Node) und nginx in einem Container.
# Endet einer der beiden Prozesse, endet der Container — Coolify startet ihn dann neu,
# statt eine halbtote Seite (nginx ohne API) weiter auszuliefern.
set -eu

: "${DATA_DIR:=/data}"
export DATA_DIR
mkdir -p "$DATA_DIR"
# Ein frisch eingehängtes Volume gehört meist root; der Dienst läuft als Benutzer „node“.
chown node:node "$DATA_DIR" 2>/dev/null || true

if [ -z "${FAME_ADMIN_TOKEN:-}" ]; then
  echo "[fame] Hinweis: FAME_ADMIN_TOKEN ist nicht gesetzt. Der Verwaltungsbereich bleibt gesperrt." >&2
fi

su-exec node node /app/server/index.mjs &
NODE_PID=$!
nginx -g 'daemon off;' &
NGINX_PID=$!

stop() { kill "$NODE_PID" "$NGINX_PID" 2>/dev/null || true; }
trap 'stop; exit 0' TERM INT

while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2
done
echo "[fame] Ein Prozess ist beendet, der Container stoppt." >&2
stop
exit 1
