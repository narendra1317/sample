# Keel — production container. No npm install needed at runtime (zero dependencies).
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
ENV NODE_ENV=production PORT=8080 KEEL_DATA=/data/keel.json
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/api/health || exit 1
CMD ["node", "server/index.js"]
