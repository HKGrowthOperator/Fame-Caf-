# FAME CAFÉ — Coolify-Build ab Repo-Root.
# Kompatibilitäts-Pfad: identisch zum Root-Dockerfile, falls die Coolify-App
# weiterhin auf /deploy/coolify/Dockerfile zeigt.
#
# Statt jede Datei einzeln zu kopieren (frühere Fassung: 10 COPY-Zeilen, die bei
# jeder neuen Datei an zwei Stellen nachgezogen werden mussten) wird hier der
# gesamte Site-Inhalt kopiert. Was nicht ins Image gehört, steht in .dockerignore.

FROM nginx:1.27-alpine

RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/coolify/nginx.conf /etc/nginx/conf.d/default.conf

COPY . /usr/share/nginx/html/
RUN rm -rf /usr/share/nginx/html/deploy \
           /usr/share/nginx/html/.github \
           /usr/share/nginx/html/Dockerfile \
           /usr/share/nginx/html/.dockerignore \
           /usr/share/nginx/html/FAME_MASTER_EXECUTION_PROMPT.md \
           /usr/share/nginx/html/README.md

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/health.txt || exit 1

CMD ["nginx", "-g", "daemon off;"]
