FROM node:24-alpine AS builder

ARG VITE_APP_TITLE=C-CLIENT-M
ARG VITE_BRIDGE_HTTP_ORIGIN=http://127.0.0.1:4285
ARG VITE_PROJECT_ROOT=/workspace/company
ARG VITE_CCLIENT_KEY=

ENV VITE_APP_TITLE=${VITE_APP_TITLE}
ENV VITE_BRIDGE_HTTP_ORIGIN=${VITE_BRIDGE_HTTP_ORIGIN}
ENV VITE_PROJECT_ROOT=${VITE_PROJECT_ROOT}
ENV VITE_CCLIENT_KEY=${VITE_CCLIENT_KEY}

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine AS runtime

ENV PORT=80
ENV HOST=0.0.0.0
ENV APP_LOGIN_PASSWORD=

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY package.json ./package.json
COPY server.mjs ./server.mjs

EXPOSE 80

CMD ["node", "server.mjs"]
