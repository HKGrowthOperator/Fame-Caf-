# FAME CAFÉ — Coolify-Build ab Repo-Root.
# Kompatibilitäts-Pfad: identisch zum Root-Dockerfile, falls die Coolify-App
# weiterhin auf /deploy/coolify/Dockerfile zeigt.
#
# Ein Container, zwei Prozesse: nginx liefert die statische Seite und reicht /api/
# an den kleinen Reservierungsdienst (server/, Node, keine Abhängigkeiten) auf
# 127.0.0.1:3001 weiter. start.sh hält beide am Leben.
#
# WICHTIG: /data muss in Coolify als persistentes Volume eingehängt sein
# (Storages → Add → Destination Path /data). Sonst sind alle Reservierungen
# nach dem nächsten Deploy verschwunden.
#
# Pflicht-Umgebungsvariable: FAME_ADMIN_TOKEN (mindestens 16 Zeichen), siehe README.

FROM node:22-alpine

RUN apk add --no-cache nginx su-exec \
 && rm -f /etc/nginx/http.d/default.conf \
 && mkdir -p /run/nginx /data \
 && ln -sf /dev/stdout /var/log/nginx/access.log \
 && ln -sf /dev/stderr /var/log/nginx/error.log

COPY deploy/coolify/nginx.conf /etc/nginx/http.d/fame.conf

# Statt jede Datei einzeln zu kopieren, wird der gesamte Site-Inhalt kopiert.
# Was nicht ins Image gehört, steht in .dockerignore. server/ gehört nicht ins
# Web-Verzeichnis (sonst wäre der Quelltext abrufbar) und zieht nach /app um.
COPY . /usr/share/nginx/html/
RUN mkdir -p /app \
 && mv /usr/share/nginx/html/server /app/server \
 && mv /usr/share/nginx/html/deploy/coolify/start.sh /start.sh \
 && chmod +x /start.sh \
 && rm -rf /usr/share/nginx/html/deploy \
           /usr/share/nginx/html/.github \
           /usr/share/nginx/html/Dockerfile \
           /usr/share/nginx/html/.dockerignore \
           /usr/share/nginx/html/FAME_MASTER_EXECUTION_PROMPT.md \
           /usr/share/nginx/html/README.md

ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/health.txt && wget -q -O - http://127.0.0.1:3000/api/config > /dev/null || exit 1

CMD ["/start.sh"]
