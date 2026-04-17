# Deployment Guide

## Overview

`C-CLIENT-M` is a mobile supervisor frontend that now defaults to same-origin API calls.

It does **not** host the execution runtime by itself. The actual execution host,
bridge service, workspace management, and Codex runtime live in:

- [C-CLIENT](https://github.com/cwwlla01/C-CLIENT)

The mobile frontend talks to a running `C-CLIENT` bridge over HTTP.

## Runtime Relationship

Recommended topology:

1. Run the `C-CLIENT` execution side first.
2. Expose the bridge endpoint, for example `http://127.0.0.1:4285`.
3. Keep the frontend on the same origin and proxy `/api/*` plus `/health` to that bridge.

Current frontend behavior:

- If bridge requests succeed, the UI renders live data.
- If bridge requests fail, the UI shows explicit error states instead of silently falling back.

## Recommended Production Topology

Preferred deployment is:

- `C-CLIENT-M` serves the frontend UI and `/api/auth/*`
- your reverse proxy forwards `/api/*` and `/health` to the bridge
- all browser requests stay on the same origin
- if you deploy on Vercel, repository `api/*` Functions provide that same-origin layer

Example Nginx layout when:

- `C-CLIENT-M` runs at `http://127.0.0.1:4275`
- bridge runs at `http://127.0.0.1:4285`

```nginx
server {
  listen 80;
  server_name _;

  location /api/auth/ {
    proxy_pass http://127.0.0.1:4275;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:4285;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location = /health {
    proxy_pass http://127.0.0.1:4285;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:4275;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

The repository root also includes the same example as a ready-to-edit file:

- [../nginx.conf](../nginx.conf)

## Build-Time Variables

These values are injected at build time:

- `VITE_APP_TITLE`
- `VITE_PROJECT_ROOT`
- `VITE_CCLIENT_KEY`
- `VITE_BRIDGE_HTTP_ORIGIN` optional, for local Vite dev proxy or direct debug only

Recommended defaults:

```text
VITE_APP_TITLE=C-CLIENT-M
VITE_PROJECT_ROOT=/workspace/company
```

Runtime variables:

```text
APP_LOGIN_PASSWORD=your-password
BRIDGE_PROXY_TARGET=http://127.0.0.1:4285
```

When `APP_LOGIN_PASSWORD` is set:

- the preview/container server exposes `/api/auth/session`
- the UI shows a password screen before rendering the app
- successful login sets an HttpOnly cookie on the same origin

When `BRIDGE_PROXY_TARGET` is set:

- `server.mjs` proxies same-origin `/api/*` and `/health`
- Vercel `api/*` Functions proxy the same routes too
- unauthenticated users cannot call those proxied endpoints when password gate is enabled
- you can run the frontend without an outer Nginx during local preview or container testing

## Docker Build

```bash
docker build \
  --build-arg VITE_APP_TITLE=C-CLIENT-M \
  --build-arg VITE_PROJECT_ROOT=/workspace/company \
  -t c-client-m:local .
```

Optional direct bridge override during build:

```bash
docker build \
  --build-arg VITE_BRIDGE_HTTP_ORIGIN=http://127.0.0.1:4285 \
  -t c-client-m:local .
```

## Docker Run

```bash
docker run --rm -it \
  -e APP_LOGIN_PASSWORD=your-password \
  -e BRIDGE_PROXY_TARGET=http://127.0.0.1:4285 \
  -p 4275:80 \
  c-client-m:local
```

Open:

- Frontend: `http://127.0.0.1:4275`

## Compose

```bash
docker compose up --build
```

The provided compose file exposes:

- `4275 -> 80`
- `host.docker.internal -> host-gateway`

## Vercel

The repository now contains a Vercel-compatible same-origin layer:

- [../vercel.json](../vercel.json)
- [../api/auth/session.js](../api/auth/session.js)
- [../api/auth/login.js](../api/auth/login.js)
- [../api/auth/logout.js](../api/auth/logout.js)
- [../api/health.js](../api/health.js)
- [../api/[...path].js](../api/%5B...path%5D.js)

Recommended Vercel environment variables:

```text
BRIDGE_PROXY_TARGET=http://107.148.164.139:4285
APP_LOGIN_PASSWORD=your-password
VITE_APP_TITLE=C-CLIENT-M
VITE_PROJECT_ROOT=/workspace/company
VITE_CCLIENT_KEY=
```

Behavior on Vercel:

- `/api/auth/*` is handled by Vercel Functions
- `/api/*` is proxied to `BRIDGE_PROXY_TARGET`
- `/health` is rewritten to `/api/health`
- the browser stays on your Vercel domain, so an `https` frontend can still work with an `http` backend through the server-side proxy

## Matching C-CLIENT

When `C-CLIENT` runs inside WSL / Podman / Docker, the bridge may only be able to
see container-internal workspace paths such as `/workspace/company`.

That means:

- The bridge can be healthy while `discover` still fails.
- If `POST /api/workspace/discover` returns `ENOENT`, check the actual mount path
  visible to the execution container instead of only checking the Windows host path.

Useful references:

- [C-CLIENT / docs / docker-podman.md](https://github.com/cwwlla01/C-CLIENT/blob/main/docs/docker-podman.md)
- [C-CLIENT / docs / local-api-reference.md](https://github.com/cwwlla01/C-CLIENT/blob/main/docs/local-api-reference.md)

## Release Notes

For GitHub release or open-source distribution, keep this repository focused on:

- mobile supervisor UI
- company-level filtering and monitoring
- task dispatch frontend

Keep execution-side runtime logic in `C-CLIENT`.
