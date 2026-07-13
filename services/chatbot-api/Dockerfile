FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
EXPOSE 4200

CMD ["node", "--import", "tsx", "services/chatbot-api/src/server.ts"]
