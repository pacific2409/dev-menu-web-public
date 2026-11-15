ARG NODE_IMAGE=node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
ARG NGINX_IMAGE=nginx:1.30.6-alpine3.24-slim@sha256:e2355aa95529a7999dad94ddcb45a8768abf6fb0b204c93b1a3ffce477d7b893

FROM ${NGINX_IMAGE} AS runtime-base

COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf

RUN rm -rf /usr/share/nginx/html/* \
    && mkdir -p /usr/share/nginx/html \
    && chown -R 101:101 /usr/share/nginx/html

USER 101:101

EXPOSE 80

ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]

FROM ${NODE_IMAGE} AS application-build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --cache /tmp/npm-cache --prefer-offline \
    && npm cache clean --force

COPY . .
RUN npm run build

FROM runtime-base AS runtime

COPY --from=application-build --chown=101:101 /app/dist/ /usr/share/nginx/html/
