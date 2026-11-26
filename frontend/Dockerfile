# syntax=docker/dockerfile:1
# ---------- build the React app ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- serve with unprivileged nginx (listens on 8080, runs as uid 101) ----------
FROM nginxinc/nginx-unprivileged:1.28-alpine
# Pull in Alpine security fixes released after the base image was built (OpenSSL, brotli, ...),
# so the image scan in the pipeline does not fail on already-fixed CVEs.
USER root
RUN apk upgrade --no-cache
USER 101
ENV API_UPSTREAM=http://shackpulse-api:8080
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
