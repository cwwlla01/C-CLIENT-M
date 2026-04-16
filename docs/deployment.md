# Deployment Guide

## Overview

`C-CLIENT-M` is a static mobile supervisor frontend.

It does **not** host the execution runtime by itself. The actual execution host,
bridge service, workspace management, and Codex runtime live in:

- [C-CLIENT](https://github.com/cwwlla01/C-CLIENT)

The mobile frontend talks to a running `C-CLIENT` bridge over HTTP.

## Runtime Relationship

Recommended topology:

1. Run the `C-CLIENT` execution side first.
2. Expose the bridge endpoint, for example `http://127.0.0.1:4285`.
3. Point `C-CLIENT-M` at that endpoint during build using `VITE_BRIDGE_HTTP_ORIGIN`.

Current frontend behavior:

- If bridge requests succeed, the UI renders live data.
- If bridge requests fail, the UI shows explicit error states instead of silently falling back.

## Required Build Args

These values are injected at build time:

- `VITE_APP_TITLE`
- `VITE_BRIDGE_HTTP_ORIGIN`
- `VITE_PROJECT_ROOT`
- `VITE_CCLIENT_KEY`

Recommended defaults when pairing with the current containerized `C-CLIENT` setup:

```text
VITE_APP_TITLE=C-CLIENT-M
VITE_BRIDGE_HTTP_ORIGIN=http://127.0.0.1:4285
VITE_PROJECT_ROOT=/workspace/company
```

## Docker Build

```bash
docker build \
  --build-arg VITE_APP_TITLE=C-CLIENT-M \
  --build-arg VITE_BRIDGE_HTTP_ORIGIN=http://127.0.0.1:4285 \
  --build-arg VITE_PROJECT_ROOT=/workspace/company \
  -t c-client-m:local .
```

## Docker Run

```bash
docker run --rm -it -p 4275:80 c-client-m:local
```

Open:

- Frontend: `http://127.0.0.1:4275`

## Compose

```bash
docker compose up --build
```

The provided compose file exposes:

- `4275 -> 80`

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
