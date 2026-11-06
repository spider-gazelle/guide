# WebSockets

A WebSocket keeps a connection open so the server and client can send each other messages at any time. Use one for chat, live dashboards and notifications. In Spider-Gazelle a WebSocket route is a controller method, so it gets route params, filters and authentication like any other route.

## Example

A chat server with rooms. Every message sent to a room is broadcast to everyone connected to it.

```
require "action-controller"

class ChatRoom < AC::Base
  base "/chat"

  ROOMS = Hash(String, Array(HTTP::WebSocket)).new { |hash, key| hash[key] = [] of HTTP::WebSocket }
  LOCK  = Mutex.new

  # Joins a chat room
  @[AC::Route::WebSocket("/:room")]
  def join(socket, room : String) : Nil
    LOCK.synchronize { ROOMS[room] << socket }

    socket.on_message do |message|
      peers = LOCK.synchronize { ROOMS[room].dup }
      peers.each &.send("#{room}: #{message}")
    end

    socket.on_close do
      LOCK.synchronize do
        sockets = ROOMS[room]
        sockets.delete(socket)
        ROOMS.delete(room) if sockets.empty?
      end
    end
  end
end

require "action-controller/server"
AC::Server.new.run
```

Connect from a browser's developer console:

```
const socket = new WebSocket("ws://localhost:3000/chat/lobby");
socket.onmessage = (event) => console.log(event.data);
socket.onopen = () => socket.send("hello");
// logs "lobby: hello"
```

## How WebSocket routes work

Declare the route with `@[AC::Route::WebSocket("/path")]`. The rules:

- The **first argument** of the method is the [`HTTP::WebSocket`](https://crystal-lang.org/api/latest/HTTP/WebSocket.html). It has no type restriction.
- Any other arguments are parsed exactly like a normal route: path params, query params, type conversion, defaults and `@[AC::Param::Info]`. See [Parameters](https://spider-gazelle.net/guides/parameters/index.md).
- The method should register its callbacks and **return**. After it returns, Spider-Gazelle runs the socket's read loop, which calls your callbacks until the connection closes. Don't block in the method, or no messages are read.
- A request that isn't a WebSocket upgrade gets `426 Upgrade Required`.

The `HTTP::WebSocket` methods you'll use most:

| Method                             | Description                                                      |
| ---------------------------------- | ---------------------------------------------------------------- |
| `send(message)`                    | Sends a text message (a `String`) or a binary message (`Bytes`). |
| \`on_message {                     | text                                                             |
| \`on_binary {                      | bytes                                                            |
| \`on_close {                       | code, reason                                                     |
| \`on_ping {                        | message                                                          |
| `close(code = nil, message = nil)` | Closes the connection.                                           |
| `closed?`                          | Whether the connection is closed.                                |

## Filters and authentication

`before_action` and `around_action` [filters](https://spider-gazelle.net/guides/filters/index.md) run before the connection is upgraded. If a filter renders a response, such as `head :unauthorized`, the upgrade doesn't happen and the client receives that response instead.

```
class Notifications < AC::Base
  base "/notifications"

  @[AC::Route::Filter(:before_action)]
  def authenticate(token : String? = nil)
    head :unauthorized unless token == "letmein"
  end

  # Streams notifications to the client
  @[AC::Route::WebSocket("/")]
  def stream(socket) : Nil
    socket.send({event: "connected"}.to_json)
    socket.on_message { |message| socket.send(message.upcase) }
  end
end
```

Browsers can't add custom headers, such as `Authorization`, to a WebSocket request. Authenticate with one of:

- the [session](https://spider-gazelle.net/guides/sessions/index.md) or another cookie, which the browser sends automatically to the same site
- a short-lived token in the query string, as above

Note

WebSocket routes can read the session, but changes to it aren't saved. The session is stored in a cookie, and there's no HTTP response to carry it once the connection is upgraded.

If the controller uses `force_tls` (see [Responses](https://spider-gazelle.net/guides/responses/index.md)), an unencrypted `ws://` request is refused with `412 Precondition Failed` and the message `WebSocket Secure (wss://) connection required`, rather than being redirected.

## Concurrency

Each connection runs in its own [fiber](https://crystal-lang.org/reference/guides/concurrency.html). Callbacks from different connections can run at the same time when your app is multi-threaded, so protect shared state, like `ROOMS` above, with a `Mutex`.

Connections only exist in the process that accepted them. Threads within a process share them (see [workers and threads](https://spider-gazelle.net/getting_started/configuration/#workers-and-threads)), but if you run several containers or servers, a broadcast from one doesn't reach sockets held by another. Use a shared message bus, such as Redis pub/sub, to fan messages out between instances.

## The route DSL

The `ws` macro defines the same kind of route without an annotation. The block arguments become the method's arguments:

```
class Echo < AC::Base
  base "/echo"

  ws "/", :echo do |socket|
    socket.on_message { |message| socket.send(message) }
  end
end
```

Prefer the annotation, which supports typed params.

## OpenAPI and MCP

WebSocket routes appear in the [OpenAPI](https://spider-gazelle.net/openapi/index.md) document as `GET` operations, using the method's doc comment. They aren't exposed as [MCP](https://spider-gazelle.net/mcp/index.md) tools, because a tool call is a single request and response.

## Testing

The spec client can open a WebSocket to your routes in-process with `establish_ws`. See [Testing WebSockets](https://spider-gazelle.net/guides/testing/#testing-websockets).

## See also

- [Filters](https://spider-gazelle.net/guides/filters/index.md)
- [Sessions and cookies](https://spider-gazelle.net/guides/sessions/index.md)
- [Testing](https://spider-gazelle.net/guides/testing/index.md)
- [Routing](https://spider-gazelle.net/guides/routing/index.md)
