FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production

CMD ["node", "--import", "tsx", "service/schedule-trigger/src/worker.ts"]
