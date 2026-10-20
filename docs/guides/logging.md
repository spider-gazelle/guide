# Logging

Spider-Gazelle logs through Crystal's standard
[`Log`](https://crystal-lang.org/api/latest/Log.html) module. This page covers
logging from your controllers, request logging, request IDs, output formats,
redacting sensitive params and changing the log level while the app runs.

## Example

Give your base controller a `Log`, and tag every log entry made during a request
with a request ID:

```crystal
require "action-controller"
require "uuid"

module App
  NAME = "my_app"
  Log  = ::Log.for(NAME)
end

abstract class App::Base < AC::Base
  # Logs from controllers use the source "my_app.controller"
  Log = ::App::Log.for("controller")

  @[AC::Route::Filter(:before_action)]
  def set_request_id
    request_id = request.headers["X-Request-ID"]? || UUID.random.to_s
    Log.context.set(client_ip: client_ip, request_id: request_id)
    response.headers["X-Request-ID"] = request_id
  end
end

class App::Orders < App::Base
  base "/orders"

  # Creates an order
  @[AC::Route::POST("/:product_id")]
  def create(product_id : Int64, quantity : Int32 = 1) : NamedTuple(product_id: Int64, quantity: Int32)
    Log.info { "creating order" }
    Log.debug { "quantity #{quantity}" }
    {product_id: product_id, quantity: quantity}
  end
end

# Configure where logs go and at what level
backend = ActionController.default_backend
::Log.setup "*", :info, backend
::Log.builder.bind "#{App::NAME}.*", :debug, backend
```

With the template's `LogHandler` in place (see [Request logging](#request-logging)),
`POST /orders/42?quantity=3` logs:

```text
level=[I] time=2026-10-02T06:23:18Z program=app source=my_app.controller message="creating order" client_ip=127.0.0.1 request_id=c6595fb2-7808-41bc-98e7-4be557b552c5
level=[D] time=2026-10-02T06:23:18Z program=app source=my_app.controller message="quantity 3" client_ip=127.0.0.1 request_id=c6595fb2-7808-41bc-98e7-4be557b552c5
level=[I] time=2026-10-02T06:23:18Z program=app source=action-controller client_ip=127.0.0.1 request_id=c6595fb2-7808-41bc-98e7-4be557b552c5 event=response method=POST path=/orders/42?quantity=3 status=200 duration=50.4µs
```

The [application template](https://github.com/spider-gazelle/spider-gazelle) sets
all of this up for you, in `src/constants.cr`, `src/config.cr` and
`src/controllers/application.cr`.

## Log sources

Every log entry has a **source**, a dotted name that says where it came from. You
configure levels per source.

| Source | What logs there |
|--------|-----------------|
| `action-controller` | Request logging from `LogHandler`, and framework warnings |
| `action-controller.session` | Session cookies that can't be decoded |
| `action-controller.mcp` | The [MCP server](../mcp/README.md) |
| `<your app name>.*` | Your code, if you create loggers with `App::Log.for(...)` |

Create a logger for your own code with `Log.for`. Chaining from an app-wide `Log`
puts everything under one prefix, so you can set its level with a single
`"my_app.*"` binding:

```crystal
module App
  Log = ::Log.for("my_app")
end

class App::Billing
  Log = ::App::Log.for("billing") # source "my_app.billing"
end
```

!!! warning
    Define `Log` in your base controller. If you don't, `Log` inside a controller
    resolves to the top-level `::Log`, whose source is empty, so you can't
    filter those entries by source.

Write entries with the usual `Log` methods. Pass a block, so the message is only
built when that level is enabled:

```crystal
Log.trace { "very detailed" }
Log.debug { "useful while developing" }
Log.info { "something happened" }
Log.warn { "something looks wrong" }
Log.error(exception: error) { "something failed" }
```

## Configuring output

`Log.setup` sets the default level and backend for every source. `Log.builder.bind`
then sets the level for specific sources. The template's `src/config.cr` does this:

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

| Environment | Your app and action-controller | Everything else (shards) |
|-------------|-------------------------------|--------------------------|
| development | `debug` | `info` |
| production (`SG_ENV=production`) | `info` | `warn` |

A pattern such as `"my_app.*"` matches `my_app` and every source below it.

### Formats

`ActionController.default_backend(io = STDOUT, formatter = default_formatter)`
returns a `Log::IOBackend`. Two formatters are provided:

* `ActionController.default_formatter`: `key=value` text, shown above. Easy to
  read and to grep.
* `ActionController.json_formatter`: one JSON object per line, for log tools such
  as Logstash, Loki or CloudWatch.

```crystal
LOG_BACKEND = ActionController.default_backend(formatter: ActionController.json_formatter)
```

```json
{"level":"INFO","program":"app","time":"2026-10-02T16:23:18+10:00","source":"my_app.controller","message":"creating order","client_ip":"127.0.0.1","request_id":"c6595fb2-7808-41bc-98e7-4be557b552c5"}
```

Both include the context (such as `request_id`), any data passed to the entry, and
the exception backtrace if there is one. `program` is `Log.progname`, which
defaults to the name of the executable.

## Request logging

`ActionController::LogHandler` is an HTTP handler that logs each request. Add it
with `ActionController::Server.before`, before the server is created:

```crystal
ActionController::Server.before(
  ActionController::ErrorHandler.new(App.running_in_production?, ["X-Request-ID"]),
  ActionController::LogHandler.new(["password", "bearer_token"]),
  HTTP::CompressHandler.new
)
```

It logs one `info` entry per response, with the method, path, status and
duration. If a route raises an unhandled exception, it logs an `error` entry
instead, with `status=500` and the backtrace.

`LogHandler.new` takes:

| Argument | Default | Description |
|----------|---------|-------------|
| `filter` | `[] of String` | Query string params whose values are logged as `[FILTERED]`. |
| `log` | `Event::Response` | Which events to log. `Event::Request | Event::Response` (or `Event::All`) also logs an entry when each request arrives. |
| `ms` | `false` | Log durations as a plain number of milliseconds, e.g. `0.0504`, instead of with a unit, e.g. `50.4µs`. Simpler for monitoring tools to parse. |
| `generate_id` | `true` | When request events are logged, add a random `request_id` to the log context. |

The events are `ActionController::LogHandler::Event` values.

The handler wraps each request in its own log context. Anything your controller
adds with `Log.context.set` appears on the handler's response entry too, as in
the example at the top of this page.

### Filtering sensitive params

```crystal
ActionController::LogHandler.new(["password", "bearer_token"])
```

`GET /login?user=steve&password=hunter2` is logged as
`path=/login?user=steve&password=[FILTERED]`.

The filter only applies to the query string in the logged path. `LogHandler`
never logs request bodies or headers, but your own log calls might, so take care
not to log passwords or tokens yourself.

## Request IDs

A request ID ties together every log entry made while handling one request, and
lets clients quote it when reporting a problem. The template's base controller
sets one in a `before_action` filter:

```crystal
@[AC::Route::Filter(:before_action)]
def set_request_id
  request_id = UUID.random.to_s
  Log.context.set(
    client_ip: client_ip,
    request_id: request_id
  )
  response.headers["X-Request-ID"] = request_id
end
```

* `Log.context.set` tags every later entry in this request, from any logger.
* The `X-Request-ID` response header lets the client see the ID.
* The template passes `["X-Request-ID"]` to `ErrorHandler`, so the header is kept
  on `500` responses, which is when it's needed most.
* `client_ip` reads the `X-Forwarded-For`, `X-Real-IP` or `Forwarded` headers set
  by proxies, falling back to the connection's address.

In a microservice, reuse the ID sent by the caller so one ID follows the request
across services, and send it on to services you call:

```crystal
request_id = request.headers["X-Request-ID"]? || UUID.random.to_s
```

!!! note
    If you log request events with `Event::Request`, the handler adds its own
    `request_id` before your filter runs, and the filter then replaces it. The
    request entry and the response entry end up with different IDs. Use one
    source of IDs: pass `generate_id: false`, or read the existing ID with
    `Log.context.metadata[:request_id]?` in your filter.

## Changing the log level at runtime

The template lets you turn on `trace` logging in a running process without a
restart, which is useful when debugging production. Send the process the `USR1`
signal:

```shell
kill -USR1 <pid>
```

The process prints `> Log level changed to Trace`. Send `USR1` again to go back to
`info` in production, or `debug` in development.

This is implemented by `App.register_severity_switch_signals` in the template's
`src/constants.cr`, and called from `src/app.cr`. It only changes the level of
your app's sources (`"#{NAME}.*"`), not action-controller's or other shards'.
It's not available on Windows.

With several [workers](../getting_started/configuration.md#workers-and-threads),
each worker is a separate process, so signal each one you want to change.

## See also

* [Configuration](../getting_started/configuration.md)
* [Filters](filters.md)
* [Errors](errors.md)
* [Deployment](../deployment/README.md)
* [Crystal's `Log` documentation](https://crystal-lang.org/api/latest/Log.html)
