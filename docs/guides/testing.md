# Testing

Spider-Gazelle apps are tested with Crystal's built-in
[spec library](https://crystal-lang.org/reference/guides/testing.html).
Action-controller adds a spec client that sends requests to your routes in-process,
without starting a server or opening a port. This page covers request specs, unit
specs, WebSockets and testing the MCP server.

## Example

```crystal
# spec/welcome_spec.cr
require "./spec_helper"

describe App::Welcome do
  client = AC::SpecHelper.client

  it "welcomes you" do
    response = client.get("/")
    response.status_code.should eq 200
    response.body.should eq %("You're being trampled by Spider-Gazelle!")
  end

  it "extracts params for you" do
    response = client.post("/api/400")
    JSON.parse(response.body).should eq({"result" => 400})
  end
end
```

Run the specs from the project root:

```shell
crystal spec
```

## Setup

The spec helper uses the [hot_topic](https://github.com/jgaskins/hot_topic) shard
to make HTTP requests without a network. Add it as a development dependency (the
template already does):

```yaml
development_dependencies:
  hot_topic:
    github: jgaskins/hot_topic
```

Then create `spec/spec_helper.cr`:

```crystal
require "spec"

# Helper methods for testing controllers
require "action-controller/spec_helper"

# Your application config
require "../src/config"
```

Require `src/config.cr`, not `src/app.cr`. `config.cr` loads your controllers and
configuration, and `app.cr` would parse the command line and start the server.
This split is why the template keeps the two files apart. See
[Configuration](../getting_started/configuration.md#how-the-template-is-organised).

Each spec file then starts with `require "./spec_helper"`.

## Request specs

`AC::SpecHelper.client` returns an
[`HTTP::Client`](https://crystal-lang.org/api/latest/HTTP/Client.html) connected
directly to your routes. Use the normal client methods, `get`, `post`, `put`,
`patch`, `delete` and `head`, with `headers:` and `body:`:

```crystal
describe Widgets do
  client = AC::SpecHelper.client

  it "creates a widget" do
    response = client.post("/widgets/",
      headers: HTTP::Headers{"Content-Type" => "application/json"},
      body: {name: "sprocket", colour: "red"}.to_json,
    )

    response.status_code.should eq 201
    Widget.from_json(response.body).name.should eq "sprocket"
  end

  # needs a YAML responder, like the one in the template's base controller
  it "responds with YAML when asked" do
    response = client.get("/widgets/1", headers: HTTP::Headers{"Accept" => "application/yaml"})
    response.headers["Content-Type"].should start_with "application/yaml"
  end
end
```

A request spec runs the whole route: param parsing, filters, the action, exception
handlers and the responder. It's the closest test to a real request.

Things to know:

* **No middleware.** Handlers added with `ActionController::Server.before`, such as
  `LogHandler`, `ErrorHandler`, compression and static files, aren't run. Requests
  go straight to the router.
* **Unhandled exceptions are raised in your spec.** Without `ErrorHandler`, an
  exception that no [exception handler](errors.md) catches isn't turned into a
  `500`. It's raised by `client.get(...)`, so use `expect_raises` to test it.
  The template's base controller handles param errors, so a bad param still
  returns `400` or `422`.
* **No cookie jar.** Cookies aren't kept between requests. Copy them yourself:

```crystal
response = client.post("/session/?username=steve&password=secret")
headers = HTTP::Headers.new
response.cookies.add_request_headers(headers)

client.get("/session/", headers: headers)
```

## Unit specs

To test a controller method directly, create a controller instance with
`spec_instance`:

```crystal
describe App::Welcome do
  it "generates a date header" do
    welcome = App::Welcome.spec_instance(HTTP::Request.new("GET", "/"))
    welcome.set_date_header.should contain("GMT")
  end
end
```

`spec_instance(request = HTTP::Request.new("GET", "/"))` builds the controller
with a context for that request. If the request matches a route, `route_params`
is set from the path.

Calling a method on the instance is a plain method call. Filters don't run, and
you pass the arguments yourself, so nothing is parsed from the request. Use unit
specs for helper methods and filters, and request specs for routes.

## Testing WebSockets

The spec client adds `establish_ws(path, headers = HTTP::Headers.new)`, which
opens an in-process connection to a [WebSocket route](websockets.md) and returns
an `HTTP::WebSocket`:

```crystal
describe Notifications do
  client = AC::SpecHelper.client

  it "streams notifications" do
    socket = client.establish_ws("/notifications/?token=letmein")

    messages = [] of String
    socket.on_message do |message|
      messages << message
      socket.close if messages.size == 2
    end

    socket.send "hi"
    socket.run # reads messages until the socket is closed

    messages.should eq [%({"event":"connected"}), "HI"]
  end

  it "rejects unauthenticated clients" do
    client.get("/notifications/").status_code.should eq 401
  end
end
```

`socket.run` blocks until the socket closes, so close it from a callback once
you've received what you expect.

If a filter rejects the connection, for example with `head :unauthorized`,
`establish_ws` raises a `Socket::Error` with the status code. Test rejections with
`expect_raises`, or with a plain `client.get` as above:

```crystal
it "requires a token" do
  expect_raises(Socket::Error, /Status code was 401/) do
    client.establish_ws("/notifications/")
  end
end
```

## Testing your MCP server

The [MCP server](../mcp/README.md) is an endpoint like any other, so you can test
it with JSON-RPC requests. Mount it on a `SpecHelper` router, then use that
router's client. This is based on the template's `spec/mcp_spec.cr`:

```crystal
require "./spec_helper"

describe "MCP server" do
  router = AC::SpecHelper.new
  ActionController::MCPServer.mount(router, "/mcp")
  client = router.hot_topic

  headers = HTTP::Headers{
    "Content-Type" => "application/json",
    "Accept"       => "application/json",
  }

  # sends a JSON-RPC request and returns the result
  rpc = ->(method : String, params : JSON::Any) do
    body = {jsonrpc: "2.0", id: 1, method: method, params: params}.to_json
    response = client.post("/mcp", headers: headers, body: body)
    response.status_code.should eq 200
    JSON.parse(response.body)["result"]
  end

  # every request after `initialize` must send the session id
  before_all do
    body = {jsonrpc: "2.0", id: 1, method: "initialize", params: {protocolVersion: "2025-11-25"}}.to_json
    response = client.post("/mcp", headers: headers, body: body)
    headers["Mcp-Session-Id"] = response.headers["Mcp-Session-Id"]
  end

  it "exposes the routes as tools" do
    rpc.call("tools/call", JSON.parse(%({"name": "open_toolbox", "arguments": {"name": "welcome"}})))

    tools = rpc.call("tools/list", JSON.parse("{}"))["tools"].as_a.map(&.["name"].as_s)
    tools.should contain "welcome_api"

    result = rpc.call("tools/call", JSON.parse(%({"name": "welcome_api", "arguments": {"example": 42}})))
    result["structuredContent"].should eq({"status" => 200, "body" => {"result" => 42}})
  end
end
```

* `AC::SpecHelper.new` is the router behind `AC::SpecHelper.client`, and
  `hot_topic` returns a client for it. You need the router itself to mount the
  MCP server on.
* `ActionController::MCPServer` comes from `require "action-controller/mcp"`,
  which the template's `config.cr` already includes.
* Tool calls go through your routes, so filters and exception handlers apply, as
  they do in production.
* Tool descriptions come from `mcp.yml`. If it hasn't been generated, the tools
  still work but have no descriptions, and a warning is logged. Generate it with
  `crystal run src/app.cr -- --mcp=mcp.yml` if your specs check descriptions.

The template's spec also checks [prompts](../mcp/README.md) with `prompts/list` and
`prompts/get`, and that routes hidden with `@[AC::MCP(hide: true)]` aren't listed.

## Running specs

```shell
crystal spec                           # everything
crystal spec spec/welcome_spec.cr      # one file
crystal spec spec/welcome_spec.cr:12   # the example on line 12
crystal spec -v --error-trace          # list each example and show full backtraces
```

Add `focus: true` to an `it` or `describe` to run only that example while you
work on it, and remove it before committing:

```crystal
it "creates a widget", focus: true do
  # ...
end
```

### Continuous integration

The template's `.github/workflows/ci.yml` checks formatting and runs the specs on
every push and pull request, and once a week, against both Crystal `latest` and
`nightly`. Simplified to a single Crystal version, it looks like this:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    container: crystallang/crystal:latest-alpine
    steps:
    - uses: actions/checkout@v4
    - name: Install dependencies
      run: shards install --ignore-crystal-version
    - name: Format
      run: crystal tool format --check
    - name: Run tests
      run: crystal spec -v --error-trace
```

See [Deployment](../deployment/README.md#github-actions) for building and
publishing a Docker image from CI.

## See also

* [Routing](routing.md)
* [Errors](errors.md)
* [WebSockets](websockets.md)
* [Sessions and cookies](sessions.md)
* [MCP](../mcp/README.md)
