FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
EXPOSE 4302

CMD ["node", "--import", "./scripts/db/load-env.mjs", "--import", "tsx", "http-api/smart-finder-api/src/server.ts"]
