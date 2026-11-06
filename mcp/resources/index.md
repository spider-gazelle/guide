# Resources and subscriptions

Tools are for the model to call. **Resources** are data the client reads by URI, such as a device's current state or a log capture. A GET route can be exposed as a [resource template](https://modelcontextprotocol.io/specification/2026-07-28/server/resources), clients can subscribe to be told when a resource changes, and routes that take a while can stream progress instead of holding the client waiting in silence.

```
require "action-controller"
require "action-controller/mcp"

class Widgets < AC::Base
  base "/widgets"

  # the widget's current state
  @[AC::MCP(resource: "app://widgets/{id}/state", mime_type: "application/json", cache_ttl: 0)]
  @[AC::Route::GET("/:id/state")]
  def state(id : Int64) : Hash(String, String)
    {"power" => "on", "widget" => id.to_s}
  end
end
```

Clients now see the template `app://widgets/{id}/state` in `resources/templates/list`, and reading `app://widgets/42/state` runs `GET /widgets/42/state`. As with tools, the template's description is the doc comment, so there's nothing extra to maintain. The route is still a tool too.

## Resource templates

The `resource:` option takes a URI template ([RFC 6570](https://www.rfc-editor.org/rfc/rfc6570), a subset):

- **Path variables:** `{name}` matches one path segment. The variables must be exactly the route's path params.
- **Query variables:** an optional trailing `{?seconds,level}` matches query params. Each must be a param of the route, and any can be left out. A URI with a query param that isn't in the template doesn't match.
- **Scheme:** the template must contain `://`. Pick a scheme for your app, such as `app://` or `placeos://`.
- **Values:** variables are percent decoded, then parsed like any other param, so `{id}` above must be an `Int64`.

These rules are checked: a `resource:` on a route that isn't a GET is a compile error, and template variables that don't match the route's params fail when `mcp.yml` is generated.

When several templates match a URI, the most specific one wins: the one with the fewest path variables, then the longest template. So `app://widgets/{id}/state` is picked over `app://widgets/{id}/{key}`.

### Annotation options

| Option                           | Effect                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `resource: "app://widgets/{id}"` | exposes the GET route as a resource template                                                              |
| `mime_type: "application/json"`  | the type of the contents. Defaults to the response's `Content-Type`                                       |
| `cache_ttl: 0`                   | seconds clients may cache a read for (`ttlMs`). Defaults to `MCPServer.cache_ttl`. Use `0` for live data  |
| `subscribe: true`                | clients can subscribe to updates, see [subscriptions](#subscriptions)                                     |
| `long_running: true`             | the response is spooled to disk and progress is streamed, see [long running routes](#long-running-routes) |
| `max_bytes: 1_048_576`           | limits the size of a long running response                                                                |

### Reading a resource

`resources/read` runs the matching route in-process with the client's forwarded headers, so filters, authentication and error handlers apply exactly as for a tool call.

- **Contents:** the response body, as `text` for text types (`text/*`, and types containing `json`, `xml`, `yaml`, `javascript` or `csv`), otherwise as a base64 `blob`.
- **`404`:** reported as an unknown resource.
- **`401`:** when [authentication](https://spider-gazelle.net/mcp/authentication/index.md) is enabled, challenges the client to sign in again.
- **Other errors:** a JSON-RPC error whose message starts with the status, such as `403 Forbidden: ...`. Client errors are invalid params (`-32602`), server errors are internal errors (`-32603`).

```
{
  "contents": [
    {"uri": "app://widgets/42/state", "mimeType": "application/json", "text": "{\"power\":\"on\",\"widget\":\"42\"}"}
  ]
}
```

Return stored JSON as is

If the state is already stored as a JSON string, as in redis, return a `String` with `content_type: "application/json"` (`render json: value` with a string writes it unchanged). Rendering it as a `String` return type would encode it a second time.

## Subscriptions

With `subscribe: true`, clients using protocol `2026-07-28` can ask to be told when a resource changes. The notification only says *which* resource changed. The client then reads it for the current value.

```
class Widgets < AC::Base
  base "/widgets"

  # the value of a widget's state key
  @[AC::MCP(resource: "app://widgets/{id}/state/{key}", mime_type: "application/json", cache_ttl: 0, subscribe: true)]
  @[AC::Route::GET("/:id/state/:key")]
  def state_value(id : Int64, key : String) : Nil
    render json: Widget.state(id, key)
  end
end

# called once for each subscribed resource. Call `changed` when it changes,
# and return a proc that stops watching
ActionController::MCPServer.watch("app://widgets/{id}/state/{key}") do |variables, _request, changed|
  subscription = Widget.on_change(variables["id"], variables["key"]) { changed.call }
  -> { subscription.cancel }
end
```

- **Register a watcher for every subscribable template.** The block receives the template variables (as strings), the client's request (for its headers) and the `changed` callback. The template string must match the annotation exactly. A subscribable template without a watcher logs a warning and isn't watched.
- **Only readable resources are watched.** Before watching, the route is requested with the client's credentials. Resources the client can't read are left out of the acknowledgement, as are URIs that don't match a subscribable template.
- **Changes are debounced:** a burst of changes is one notification per `MCPServer.update_debounce` (250ms by default).
- **Instances:** the watcher runs on the instance holding the client's stream, so it must see changes made anywhere. Use a shared channel such as redis pub/sub when you run several instances. Any instance can then serve any client.

### The listen stream

Clients subscribe with `subscriptions/listen`, and the response is a long lived `text/event-stream`:

1. `notifications/subscriptions/acknowledged`, listing the resources being watched.
1. `notifications/resources/updated` with the `uri`, each time one changes.
1. SSE comments every `MCPServer.keep_alive` (15 seconds), which keep proxies from closing an idle connection.
1. A final `{"resultType": "complete"}` result when the server ends the stream.

The stream ends, and the watchers are stopped, when:

- the client disconnects;
- `MCPServer.listen_timeout` expires. It's `nil` by default, which never expires;
- nothing could be watched;
- `Transport#close_subscriptions` is called, i.e. when shutting down.

A listen can watch up to `MCPServer.max_subscriptions` (100) resources. Clients must use a listen stream: the older `resources/subscribe` method was removed from MCP.

## Long running routes

Some routes take a while, such as capturing a device's logs for a minute. Annotate them `long_running: true` and:

- **The response is spooled to a temporary file** rather than held in memory, and deleted once it's sent. `max_bytes:` limits it. Anything over the limit is dropped and the result is marked truncated.
- **Clients are kept informed:** when the client accepts `text/event-stream`, the response becomes an event stream once there's something to send. That's progress notifications, or an SSE comment every `MCPServer.keep_alive`. Errors that happen quickly, such as a `401` or `404`, are still plain JSON responses.
- **Disconnecting cancels the request.** The route sees this through `mcp_context`.

`long_running:` works for tools and for resources, but a long running resource can't also be subscribed to.

```
class Widgets < AC::Base
  base "/widgets"

  # captures the widget's output for a period of time
  @[AC::MCP(resource: "app://widgets/{id}/output{?seconds}", mime_type: "text/plain", cache_ttl: 0, long_running: true, max_bytes: 1_048_576)]
  @[AC::Route::GET("/:id/output")]
  def output(id : Int64, seconds : Int32 = 30) : Nil
    response.content_type = "text/plain"
    @__render_called__ = true
    seconds.times do |second|
      break if mcp_context.try { |context| context.cancelled? || context.full? }
      response << "output #{second} from widget #{id}\n"
      response.flush
      mcp_context.try &.progress(second + 1, seconds, "captured #{second + 1}s")
      sleep 1.second
    end
  end
end
```

### `mcp_context`

`mcp_context` is `nil` for regular HTTP requests, so the route works over HTTP too.

| Method                                           | Purpose                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `progress(progress, total = nil, message = nil)` | sends `notifications/progress`. Only sent when the client provided a `progressToken`, and only when `progress` increases |
| `cancelled?`                                     | `true` once the client has disconnected                                                                                  |
| `done`                                           | a `Channel(Nil)` that's closed on cancellation, for use in a `select`                                                    |
| `full?`                                          | `true` once the response reached its spool limit, so writing more is wasted                                              |

Client timeouts

The result is only sent once the route returns. Some clients time out requests that don't report progress, and others time out after a fixed period regardless. Keep the default short, report progress, and say in the doc comment that long periods may not work with every client.

## Capabilities

Clients see resource support in the server's capabilities: `resources` when any template exists, and `resources.subscribe` (for `2026-07-28` clients) when any is subscribable. `resources/templates/list` includes `ttlMs` and `cacheScope` like the other lists.

## See also

- [MCP overview](https://spider-gazelle.net/mcp/index.md)
- [Annotation options](https://spider-gazelle.net/mcp/prompts/index.md)
- [Configuration](https://spider-gazelle.net/mcp/configuration/index.md)
- [Testing your MCP server](https://spider-gazelle.net/guides/testing/#testing-your-mcp-server)
