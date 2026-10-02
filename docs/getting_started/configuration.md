# Configuration

This page covers how a Spider-Gazelle app is configured: environment variables,
`src/config.cr` and the command line options of the compiled binary. It follows the
layout of the [application template](https://github.com/spider-gazelle/spider-gazelle),
which most apps start from.

## Quick example

Every setting has a default, so the app runs without any configuration. In
production, set the environment and a session secret, and bind to all interfaces:

```shell
export SG_ENV=production
export COOKIE_SESSION_SECRET="$(openssl rand -hex 16)"

./bin/app -b 0.0.0.0 -p 8080 -w 4
```

## How the template is organised

The template splits configuration over three files. Each has one job:

| File | Job |
|------|-----|
| `src/constants.cr` | Reads environment variables into constants such as `App::DEFAULT_PORT`. Has no side effects. |
| `src/app.cr` | Parses the command line, then requires `config.cr` and starts the server. |
| `src/config.cr` | Requires your controllers and models, then configures logging, middleware, the MCP server and sessions. |

`app.cr` parses the command line **before** it requires `config.cr`. This means
options such as `--routes` and `--help` exit before any database connections
or other start-up work in `config.cr` happens. Specs require `config.cr` directly,
so your tests get the same configuration without starting a server.

## Environment variables

These are read in `src/constants.cr`. Command line options take precedence over
the port, host and worker count.

| Variable | Default | Purpose |
|----------|---------|---------|
| `SG_ENV` | `development` | Set to `production` for production behaviour, see below. |
| `SG_SERVER_HOST` | `127.0.0.1` | Address to bind. Use `0.0.0.0` in containers. |
| `SG_SERVER_PORT` | `3000` | Port to bind. |
| `SG_WORKER_COUNT` | `1` | Number of threads handling requests, see [Workers and threads](#workers-and-threads). |
| `PUBLIC_WWW_PATH` | `./www` | Folder of static files. Ignored if the folder doesn't exist. |
| `COOKIE_SESSION_KEY` | `_spider_gazelle_` | Name of the session cookie. |
| `COOKIE_SESSION_SECRET` | a fixed example value | Secret that encrypts and signs the session cookie. Must be at least 32 bytes. |
| `SG_MCP_PATH` | `/mcp` | Path of the [MCP](../mcp/README.md) endpoint. An empty string disables it. |
| `SG_MCP_DESCRIPTION` | `mcp.yml` | Location of the generated MCP tool descriptions. |

!!! warning
    The default `COOKIE_SESSION_SECRET` is in the public template, so anyone can
    forge your session cookies with it. Always set your own secret in production.

### Production mode

When `SG_ENV=production`, `App.running_in_production?` returns `true` and the
template:

* logs at `info` for your app and action-controller, and `warn` for everything
  else (instead of `debug` and `info`), see [Logging](../guides/logging.md)
* uses the production error handler, which doesn't send exception details or
  backtraces to the client
* marks the session cookie `Secure`, so browsers only send it over HTTPS

Use `App.running_in_production?` in your own code for anything else that differs
between environments.

## config.cr

This is the template's `src/config.cr`, section by section.

### Requires

```crystal
require "action-controller"
require "./constants"

require "./controllers/application"
require "./controllers/*"
require "./models/*"

# Server required after application controllers
require "action-controller/server"

# Exposes the application routes to LLM clients
require "action-controller/mcp"
```

`action-controller/server` must be required **after** your controllers. Routes are
collected at compile time, and the server only sees controllers defined before it
is required.

### Logging

```crystal
if running_in_production?
  log_level = ::Log::Severity::Info
  ::Log.setup "*", :warn, LOG_BACKEND
else
  log_level = ::Log::Severity::Debug
  ::Log.setup "*", :info, LOG_BACKEND
end
::Log.builder.bind "action-controller.*", log_level, LOG_BACKEND
::Log.builder.bind "#{NAME}.*", log_level, LOG_BACKEND
```

See [Logging](../guides/logging.md) for log sources, request IDs, JSON output
and changing the level at runtime.

### Middleware

```crystal
filter_params = ["password", "bearer_token"]
keeps_headers = ["X-Request-ID"]

ActionController::Server.before(
  ActionController::ErrorHandler.new(running_in_production?, keeps_headers),
  ActionController::LogHandler.new(filter_params),
  HTTP::CompressHandler.new
)
```

`ActionController::Server.before` adds standard Crystal
[HTTP handlers](https://crystal-lang.org/api/latest/HTTP/Handler.html) that run, in
order, before your routes. `Server.after` adds handlers that only run when no route
matches. Handlers must be added before the server is created.

* `ErrorHandler.new(production, persist_headers)` turns unhandled exceptions into
  `500` responses. In development it renders a detailed exception page. Headers
  named in `persist_headers` are kept on the error response, so clients still get
  their `X-Request-ID`.
* `LogHandler.new(filter)` logs every response. Query string params named in
  `filter` are logged as `[FILTERED]`.
* `HTTP::CompressHandler` gzips or deflates responses when the client supports it.

### Static files

```crystal
if File.directory?(STATIC_FILE_PATH)
  ::MIME.register(".yaml", "text/yaml")

  ActionController::Server.before(
    ::HTTP::StaticFileHandler.new(STATIC_FILE_PATH, directory_listing: false)
  )
end
```

Files in `./www` (or `PUBLIC_WWW_PATH`) are served when a request doesn't match a
route.

### MCP server

```crystal
ActionController::MCPServer.tap do |mcp|
  mcp.server_name = NAME
  mcp.server_version = VERSION
  mcp.description_path = ENV["SG_MCP_DESCRIPTION"]? || "mcp.yml"
end
```

`app.cr` mounts the MCP server at `SG_MCP_PATH`. The options, including
authentication, are covered in the [MCP guide](../mcp/README.md).

### Sessions

```crystal
ActionController::Session.configure do |settings|
  settings.key = COOKIE_SESSION_KEY
  settings.secret = COOKIE_SESSION_SECRET
  # HTTPS only:
  settings.secure = running_in_production?
end
```

`key` and `secret` have no defaults in action-controller, so they must be set
before a session is used. See [Sessions and cookies](../guides/sessions.md) for
every option.

## Command line options

These are defined in the template's `src/app.cr`. Run `./bin/app --help` to list
them.

| Option | Description |
|--------|-------------|
| `-b HOST`, `--bind=HOST` | Address to bind. Default `SG_SERVER_HOST`, else `127.0.0.1`. |
| `-p PORT`, `--port=PORT` | Port to bind. Default `SG_SERVER_PORT`, else `3000`. |
| `-w COUNT`, `--workers=COUNT` | Number of threads handling requests. Default `SG_WORKER_COUNT`, else `1`. `0` or less uses the CPU count. |
| `-r`, `--routes` | Prints the routes, then exits. |
| `-v`, `--version` | Prints the app name and version, then exits. |
| `-c URL`, `--curl=URL` | Requests `URL` as a health check, then exits. See below. |
| `-d`, `--docs` | Prints the [OpenAPI](../openapi/README.md) document as YAML, then exits. |
| `-f FILE`, `--file=FILE` | With `--docs`, writes the document to `FILE` instead. Must come **after** `--docs`. |
| `--mcp=FILE` | Writes the [MCP](../mcp/README.md) tool descriptions to `FILE`, then exits. |
| `-h`, `--help` | Prints the options, then exits. |

### Listing routes

```shell
$ ./bin/app --routes
Controller#Action    Verb URI Pattern
App::Welcome#index   get  /
App::Welcome#api     get  /api/:example
App::Welcome#api     get  /api/other/route
App::Welcome#api     post /api/:example
App::Welcome#openapi get  /openapi
```

### Generating OpenAPI and MCP descriptions

```shell
./bin/app --docs --file=openapi.yml
./bin/app --mcp=mcp.yml
```

Both read the doc comments in your source code by running `crystal docs`. So
they must be run from the project root, on a machine with `crystal` installed.
That's why the template's [Dockerfile](../deployment/README.md) generates both
files during the build stage and copies them into the final image.

!!! note
    `--file` is only registered once `--docs` has been parsed. `--docs --file=x.yml`
    works, `--file=x.yml --docs` doesn't. It's also why `--file` isn't listed by
    `--help`.

### Health checks

```shell
./bin/app -c http://127.0.0.1:3000/
```

`-c` requests the URL using Crystal's built-in HTTP client, so you don't need
`curl` in your container image. It exits with:

| Exit code | Meaning |
|-----------|---------|
| `0` | The response status was between 200 and 499. |
| `1` | Any other status, for example a 5xx. |
| `2` | The request failed, for example the connection was refused. |

A 4xx counts as healthy because the server answered. Point it at a route that
doesn't need authentication. See [Deployment](../deployment/README.md#health-checks).

### Workers and threads

`-w` (or `SG_WORKER_COUNT`) scales your app across CPU cores with threads. A single
process runs your requests on several threads:

```crystal
server.threads(thread_count)
```

`threads` resizes Crystal's default execution context to `count` threads. `0` or less
uses the CPU count, and `1` (the default) keeps the app single threaded.

Threads share memory: a cache, or the in-memory sessions of the MCP server, is shared by
every request. Any state you change from requests, such as class variables or mutable
constants, must be protected with a `Mutex` (or held in a database or Redis).

!!! note "Processes instead of threads"
    The template also includes a commented-out `server.cluster(thread_count, "-w", "--workers")`,
    which starts separate processes sharing the port instead. Forking is deprecated in
    Crystal, so prefer threads. With processes nothing is shared, so caches and MCP
    sessions exist once per process.

`threads` resizes Crystal's default
[execution context](https://crystal-lang.org/reference/latest/guides/concurrency.html).
Check the Crystal documentation for the compiler flags your Crystal version needs
for multi-threading.

### Signals

* `SIGTERM`, `SIGINT` (Ctrl+C) and `SIGHUP` close the server gracefully.
* `SIGUSR1` toggles `trace` logging for your app's logs, see
  [Logging](../guides/logging.md#changing-the-log-level-at-runtime).

## Server options

If you don't use the template, create and run the server yourself:

```crystal
require "action-controller"
# ... require your controllers ...
require "action-controller/server"

server = ActionController::Server.new(port: 3000, host: "0.0.0.0")
server.run { puts "Listening on #{server.print_addresses}" }
```

To serve HTTPS directly, pass an `OpenSSL::SSL::Context::Server` as the first
argument: `ActionController::Server.new(ssl_context, 3443, "0.0.0.0")`. Most
deployments terminate TLS at a load balancer or reverse proxy instead.

## See also

* [Your first app](README.md)
* [Logging](../guides/logging.md)
* [Sessions and cookies](../guides/sessions.md)
* [Deployment](../deployment/README.md)
* [OpenAPI](../openapi/README.md) and [MCP](../mcp/README.md)
