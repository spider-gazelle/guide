# Your first app

This page takes you from an empty folder to a running Spider-Gazelle API. Start
here if you're new to Spider-Gazelle, or new to Crystal.

Spider-Gazelle doesn't depend on anything beyond [Crystal](https://crystal-lang.org)
and its package manager, [Shards](https://crystal-lang.org/reference/the_shards_command/index.html).
There are two ways to start:

* **From the application template** (recommended). You get a project with logging,
  sessions, error handling, specs, a Dockerfile, CI, OpenAPI docs and an MCP server
  already wired up.
* **From scratch.** You add the `action-controller` shard to a new Crystal project.
  This is useful for learning, or for adding an HTTP API to an existing project.

## Install Crystal

Follow the [Crystal installation guide](https://crystal-lang.org/install/) for your
operating system, then check it worked:

```shell
crystal --version
shards --version
```

## Start from the template

The [spider-gazelle template](https://github.com/spider-gazelle/spider-gazelle) is a
complete, working application. Clone it into a folder named after your project, and
give it a fresh git history:

```shell
git clone https://github.com/spider-gazelle/spider-gazelle.git my_app
cd my_app
rm -rf .git && git init

shards install
crystal run src/app.cr
```

The app compiles and starts listening:

```text
Launching Spider-Gazelle v2.0.0
Listening on http://127.0.0.1:3000
```

Open <http://localhost:3000> and you'll see `"You're being trampled by Spider-Gazelle!"`.
Try <http://localhost:3000/api/42> too, which returns `{"result":42}`.

!!! note
    Crystal is a compiled language, so `crystal run` compiles your app before it
    starts. The first build takes a little longer, later builds are cached.

### Project layout

| Path | Purpose |
|------|---------|
| `src/app.cr` | Entry point. Parses the [command line options](configuration.md#command-line-options) and starts the server. |
| `src/config.cr` | Requires your code and configures logging, middleware, sessions and the MCP server. |
| `src/constants.cr` | App name, version and settings read from [environment variables](configuration.md#environment-variables). |
| `src/controllers/application.cr` | `App::Base`, the abstract controller every other controller inherits from. Holds shared filters, responders and error handlers. |
| `src/controllers/welcome.cr` | An example controller. |
| `src/models/` | Your models. |
| `spec/` | Your [specs](../guides/testing.md). |
| `www/` | Static files, served when no route matches. |
| `Dockerfile` | Builds a small production image, see [Deployment](../deployment/README.md). |
| `.github/workflows/ci.yml` | Checks formatting and runs the specs on every push. |

Change the app name in `src/constants.cr` (`NAME = "Spider-Gazelle"`) and the
`name` in `shard.yml`. Before you deploy, set your own session secret, see
[Configuration](configuration.md#sessions).

## Start from scratch

Create a new Crystal app and add `action-controller` to its `shard.yml`:

```shell
crystal init app my_app
cd my_app
```

```yaml
dependencies:
  action-controller:
    github: spider-gazelle/action-controller
    version: ~> 8.14
```

Run `shards install`, then replace `src/my_app.cr` with:

```crystal
require "action-controller"

# Says hello
class Hello < AC::Base
  base "/"

  # Returns a friendly greeting
  @[AC::Route::GET("/")]
  def index : String
    "Hello, World!"
  end
end

# The server must be required after your controllers
require "action-controller/server"

server = AC::Server.new(3000, "127.0.0.1")
server.run { puts "Listening on #{server.print_addresses}" }
```

Start it with `crystal run src/my_app.cr` and request the route:

```shell
$ curl http://localhost:3000/
"Hello, World!"
```

The response is `"Hello, World!"` with quotes because responses are JSON by default.
The client's `Accept` header selects the format, see
[Responses](../guides/responses.md).

`AC` is an alias for `ActionController`, so `AC::Base` and
`ActionController::Base` are the same class.

## Your first route

A controller is a class that inherits from `AC::Base`, and a route is a method
with a route annotation. Add a second route to the `Hello` controller:

```crystal
# Greets someone by name, e.g. GET /greet/Steve?shout=true
@[AC::Route::GET("/greet/:name")]
def greet(name : String, shout : Bool = false) : String
  greeting = "Hello, #{name}!"
  shout ? greeting.upcase : greeting
end
```

```shell
$ curl "http://localhost:3000/greet/Steve?shout=true"
"HELLO, STEVE!"
```

There's no `params["name"]` boilerplate here:

* `name` matches the `:name` segment in the route path.
* `shout` isn't in the path, so it's read from the query string. It has a
  default, so it's optional. A `Bool` is `true` when the value is `true` (in any
  case) and `false` otherwise.
* Values are converted to the argument type. If a value can't be converted, for
  example `abc` for an `Int32` argument, Spider-Gazelle responds with an error
  instead of calling your method.

That one annotated method is also your documentation. The doc comment, argument
types and return type become the [OpenAPI](../openapi/README.md) operation and the
[MCP](../mcp/README.md) tool description, so your API docs and LLM tools can't
drift from the code.

From here, read the guides:

* [Routing](../guides/routing.md): controllers, base paths, HTTP verbs and the route DSL.
* [Parameters](../guides/parameters.md): type conversion, `@[AC::Param::Info]` and request bodies.
* [Responses](../guides/responses.md): response formats, status codes and headers.
* [Filters](../guides/filters.md): run code before, around or after your routes.
* [Errors](../guides/errors.md): turn exceptions into consistent error responses.

## Run the specs

The template ships with specs that use Crystal's built-in
[spec library](https://crystal-lang.org/reference/guides/testing.html):

```shell
crystal spec
```

See [Testing](../guides/testing.md) to write your own.

## Reload while you develop

Crystal doesn't reload code at runtime. To rebuild and restart whenever a file
changes, use a file watcher such as [watchexec](https://github.com/watchexec/watchexec)
or [nodemon](https://nodemon.io/):

```shell
watchexec -r -e cr -- crystal run src/app.cr
# or
nodemon --watch src -e cr --exec crystal run src/app.cr
```

## Build a binary

For production, compile an optimised binary. With the template, `shards build`
uses the `app` target in `shard.yml` and writes `bin/app`:

```shell
shards build --production --release
./bin/app --help
```

The binary has options for the port, host, worker count, routes listing, health
checks and generating the OpenAPI and MCP description files. See
[Configuration](configuration.md#command-line-options). For containers, see
[Deployment](../deployment/README.md).

## See also

* [Configuration](configuration.md): environment variables, `config.cr` and command line options
* [Routing](../guides/routing.md)
* [Testing](../guides/testing.md)
* [Deployment](../deployment/README.md)
* [OpenAPI](../openapi/README.md) and [MCP](../mcp/README.md)
