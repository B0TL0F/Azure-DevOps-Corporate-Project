# syntax=docker/dockerfile:1
# ---------- deps: install production dependencies only ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- runtime ----------
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
# apk upgrade pulls in Alpine security fixes released after the base image was built.
RUN apk upgrade --no-cache && apk add --no-cache tini
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
USER node
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
