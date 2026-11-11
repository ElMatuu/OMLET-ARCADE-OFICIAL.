FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build:web && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
