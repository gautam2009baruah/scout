FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
EXPOSE 4301

CMD ["node", "--import", "./scripts/db/load-env.mjs", "--import", "tsx", "http-api/recorder-sync-api/src/server.ts"]
