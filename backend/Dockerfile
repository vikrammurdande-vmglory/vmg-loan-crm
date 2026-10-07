FROM node:22-alpine AS test
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src ./src
COPY test ./test
RUN node test/cibilFinancialSync.test.js && node test/cibilPersistence.test.js

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 5000
CMD ["npm","start"]
