FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache git python3 make g++

COPY package.json .
RUN npm install --omit=dev --ignore-scripts && npm rebuild bcrypt

COPY src/ ./src/

CMD ["node", "src/index.js"]
