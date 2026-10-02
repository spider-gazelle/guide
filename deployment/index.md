# Deployment

A Spider-Gazelle app compiles to a single binary, so deploying it is mostly a matter of building that binary and running it. This page describes the Docker setup in the [application template](https://github.com/spider-gazelle/spider-gazelle), which builds a small image containing only your binary and the files it needs. Docker isn't required, the same steps apply to any server.

## Quick start

From your project root:

```
docker build -t my-app .
docker run --rm -p 3000:3000 -e SG_ENV=production -e COOKIE_SESSION_SECRET="$(openssl rand -hex 16)" my-app
```

Then open <http://localhost:3000>.

## The Dockerfile

The template's `Dockerfile` is a multi-stage build.

**Build stage** (`84codes/crystal:latest-alpine`):

1. Creates an unprivileged `appuser` (UID `10001`) to run the app.
1. Installs the build dependencies, then copies `shard.yml`, `shard.override.yml` and `shard.lock` and runs `shards install --production`. Dependencies are copied before your source, so Docker caches them until they change.
1. Copies `src/` and builds an optimised binary with `shards build --production --release`.
1. Collects the shared libraries the binary links against.
1. Generates the API descriptions while the source code is still available:

```
RUN ./bin/app --docs --file=openapi.yml && \
    ./bin/app --mcp=mcp.yml
```

**Final stage** (`FROM scratch`, an empty image) contains only:

- the binary at `/app`, and its shared libraries
- `openapi.yml` and `mcp.yml`
- CA certificates, so the app can call HTTPS services
- timezone data, and the user and group files for `appuser`

The final image has no shell, package manager or compiler, which keeps it small and reduces what an attacker could use.

### Why openapi.yml and mcp.yml are generated at build time

The [OpenAPI document](https://spider-gazelle.net/openapi/index.md) and the [MCP tool descriptions](https://spider-gazelle.net/mcp/index.md) are both built from the doc comments in your source code. They're extracted with `crystal docs`, which needs the compiler and the source, and neither is in the final image. So the build stage generates the files and the final stage ships them next to the binary.

At runtime:

- The template serves `openapi.yml` at `GET /openapi`.
- The MCP server loads `mcp.yml` the first time a client connects. Its location is set by `SG_MCP_DESCRIPTION`, relative to the working directory (`/` in the image). If the file is missing, the tools still work, but without descriptions.

Tip

Because routes, OpenAPI operations and MCP tools all come from the same annotated methods, every image you build ships documentation that matches its code.

## Running the container

```
docker run -d \
  --name my-app \
  --restart unless-stopped \
  -p 8080:3000 \
  -e SG_ENV=production \
  -e COOKIE_SESSION_SECRET=your-32-character-or-longer-secret \
  my-app
```

- `-d` runs the container in the background.
- `--restart unless-stopped` restarts it after a crash or a reboot.
- `-p 8080:3000` maps port 8080 on the host to port 3000 in the container.
- `-e` sets [environment variables](https://spider-gazelle.net/getting_started/configuration/#environment-variables).

The image's default command binds to `0.0.0.0` on port 3000:

```
ENTRYPOINT ["/app"]
CMD ["-b", "0.0.0.0", "-p", "3000"]
```

Arguments after the image name replace `CMD` and are passed to `/app`. Include `-b 0.0.0.0` when you do this. Without it the app binds to `127.0.0.1` inside the container and can't be reached:

```
docker run --rm -p 3000:3000 my-app -b 0.0.0.0 -p 3000 -w 4
docker run --rm my-app --routes
```

Manage the container with `docker logs -f my-app`, `docker restart my-app`, `docker stop my-app` and `docker rm my-app`.

### Docker Compose

The template includes a `docker-compose.yml` along these lines:

```
services:
  sg:
    build: .
    ports:
      - "3000:3000"
    environment:
      SG_ENV: "production"
```

Run `docker compose up -d --build` to build and start it.

## Environment variables

Configure the container with environment variables rather than rebuilding it. The ones you'll usually set in production:

| Variable                | Why                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `SG_ENV=production`     | Production logging, no exception details in error responses, `Secure` session cookies. |
| `COOKIE_SESSION_SECRET` | The template's default is public. Set your own, at least 32 bytes.                     |
| `COOKIE_SESSION_KEY`    | Optional, the session cookie name.                                                     |
| `SG_MCP_PATH`           | Optional. Set to an empty string to turn off the MCP endpoint.                         |

See [Configuration](https://spider-gazelle.net/getting_started/configuration/#environment-variables) for the full list. Pass secrets through your platform's secret store, not on the command line in shared environments.

## Health checks

The binary can health check itself. `-c URL` requests the URL with Crystal's built-in HTTP client, so a `scratch` image doesn't need `curl`:

```
HEALTHCHECK CMD ["/app", "-c", "http://127.0.0.1:3000/"]
```

It exits `0` for a response status from 200 to 499, `1` for any other status and `2` if the request fails. Docker marks the container `healthy` when the command exits `0` and `unhealthy` after repeated failures, and `docker ps` shows the status.

- Point it at a cheap route that doesn't need authentication.
- If you change the port, change the health check URL too.
- Orchestrators that run commands, such as Kubernetes exec probes or ECS health checks, can use the same command:

```
livenessProbe:
  exec:
    command: ["/app", "-c", "http://127.0.0.1:3000/"]
```

## Workers and scaling

A Crystal process handles many requests concurrently. To use more CPU cores, run more threads with `-w` (or `SG_WORKER_COUNT`):

```
docker run -p 3000:3000 my-app -b 0.0.0.0 -p 3000 -w 4
docker run -p 3000:3000 -e SG_WORKER_COUNT=4 my-app
```

`-w 0` uses one thread per CPU core. See [Workers and threads](https://spider-gazelle.net/getting_started/configuration/#workers-and-threads).

When you run several containers behind a load balancer:

- Session cookies work on any instance, as long as they share the same `COOKIE_SESSION_SECRET`.
- [WebSocket](https://spider-gazelle.net/guides/websockets/index.md) connections and MCP sessions live in the process that accepted them. MCP clients need sticky sessions, see [MCP](https://spider-gazelle.net/mcp/index.md).

## Pushing to a registry

Tag the image with your registry's address, log in and push. For the GitHub Container Registry:

```
docker build -t ghcr.io/my-org/my-app:1.0.0 .
echo "$GITHUB_TOKEN" | docker login ghcr.io -u my-username --password-stdin
docker push ghcr.io/my-org/my-app:1.0.0
```

On the server, `docker pull ghcr.io/my-org/my-app:1.0.0`, then run it as above. Docker Hub and cloud registries work the same way with their own address.

## GitHub Actions

The template's `.github/workflows/ci.yml` runs the formatter and specs on every push, see [Testing](https://spider-gazelle.net/guides/testing/#continuous-integration).

To build and publish an image as well, add a workflow such as this one. It isn't part of the template. It pushes to the GitHub Container Registry on every push to `main` and every `v*` tag:

```
# .github/workflows/docker.yml
name: Docker
on:
  push:
    branches: [main]
    tags: ["v*"]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

The image build runs `shards build`, but not your specs. Run the CI workflow first, or add a `needs:` dependency on its job, so failing code isn't published.

## Without Docker

Build on a machine with the same OS and architecture as your server. The binary links against shared libraries such as OpenSSL and PCRE2, so the server needs them installed too. `ldd bin/app` lists them.

```
shards build --production --release
./bin/app --docs --file=openapi.yml
./bin/app --mcp=mcp.yml
```

Copy `bin/app`, `openapi.yml` and `mcp.yml` to the server, and run the binary from the folder containing the two YAML files:

```
SG_ENV=production ./app -b 0.0.0.0 -p 3000
```

Run it under a process supervisor such as systemd, so it restarts on failure. The app shuts down gracefully on `SIGTERM`.

## See also

- [Configuration](https://spider-gazelle.net/getting_started/configuration/index.md)
- [Logging](https://spider-gazelle.net/guides/logging/index.md)
- [Testing](https://spider-gazelle.net/guides/testing/index.md)
- [OpenAPI](https://spider-gazelle.net/openapi/index.md)
- [MCP](https://spider-gazelle.net/mcp/index.md)
