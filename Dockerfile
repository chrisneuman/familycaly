FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production CONFIG_DIR=/config DATA_DIR=/data PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
EXPOSE 8080
RUN mkdir -p /data && chown node:node /data
USER node
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server/index.js"]
