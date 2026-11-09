FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY lib ./lib
COPY migrations ./migrations
COPY scripts ./scripts
COPY public ./public
COPY server.js ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/saglik || exit 1
CMD ["node", "server.js"]
