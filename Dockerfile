FROM node:18-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=192"

EXPOSE 8080

CMD ["node", "server.js"]
