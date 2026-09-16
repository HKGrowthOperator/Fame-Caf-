FROM nginx:1.27-alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY deploy/coolify/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY styles.css /usr/share/nginx/html/styles.css
COPY script.js /usr/share/nginx/html/script.js

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
