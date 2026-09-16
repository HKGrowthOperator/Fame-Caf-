FROM nginx:1.27-alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY deploy/coolify/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY styles.css /usr/share/nginx/html/styles.css
COPY premium-fixes.css /usr/share/nginx/html/premium-fixes.css
COPY master-upgrade.css /usr/share/nginx/html/master-upgrade.css
COPY script.js /usr/share/nginx/html/script.js
COPY impressum.html /usr/share/nginx/html/impressum.html
COPY datenschutz.html /usr/share/nginx/html/datenschutz.html
COPY robots.txt /usr/share/nginx/html/robots.txt

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
