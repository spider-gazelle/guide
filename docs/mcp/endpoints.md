# Controller endpoints

The global MCP server exposes your whole API as toolboxes. A controller can also be
served as **its own MCP server**, scoped to one resource: a room, an account, a
project. Give each user, team or integration the URL of the resource they work with,
and the model only sees the tools for it.

```crystal
# Controls a room, look up its state before changing it
@[AC::MCP(endpoint: true)]
class Room < AC::Base
  base "/rooms/:room_id"

  # the room state
  @[AC::Route::GET("/state")]
  def state(room_id : String) : State
    State.for(room_id)
  end

  # turns the lights on or off
  @[AC::Route::POST("/lights")]
  def lights(room_id : String, on : Bool) : Nil
    Lights.set(room_id, on)
  end
end
```

`ActionController::MCPServer.mount(server)` mounts it alongside the global server. A
client connecting to `/rooms/boardroom/mcp` sees two tools, `state()` and
`lights(on)`, and both run against the boardroom.

## How it works

| | Global server | Controller endpoint |
|---|---|---|
| URL | `/mcp` (configurable) | `<base>/mcp`, or `<base>/sub/path` with `endpoint: "/sub/path"` |
| Tools | toolboxes, opened on demand, plus the proxies | every route and prompt of the controller, listed directly |
| Tool names | `<toolbox>_<method>` | `<method>` |
| Instructions | `MCPServer.instructions` | the controller's doc comment, or its [`instructions` method](#dynamic-instructions) |
| Server name | `MCPServer.server_name` | the controller's toolbox name, i.e. `room` |

- **Bound path params:** path params in the base path (`:room_id`) are taken from the
  endpoint URL. They're removed from the tool arguments, so the model can't pick a
  different room, and a session can only be used at the URL it was created at.
- **Nothing to open:** there are no toolboxes, meta tools or proxies, so it works with
  clients that ignore `tools/list_changed`.
- **Visibility:** an endpoint controller is hidden from the global server. Annotate it
  `@[AC::MCP(endpoint: true, hide: false)]` to keep it there too. A method annotated
  `hide: true` is hidden from both. `behaviour:`, `visibility:`, `title:`, `ui:`, icons and `prompt: true` work as
  usual, and the controller's icons are the endpoint server's icon.
- **Descriptions:** `write_description` includes the endpoints in `mcp.yml`. If a
  deployed `mcp.yml` is missing an endpoint, the description is regenerated without
  comments and a warning is logged.

## Dynamic instructions

The instructions tell the model what it's working with. To build them for each session,
for example from the room's name and features, define an `instructions` method on the
endpoint controller:

```crystal
@[AC::MCP(endpoint: true)]
class Room < AC::Base
  base "/rooms/:room_id"

  # runs like a route when a client connects
  def instructions(room_id : String) : String
    room = RoomModel.find!(room_id)
    "You control #{room.name}, which has #{room.features.join(", ")}. Look up its state before changing it."
  end
end
```

- **It runs like a route:** before filters run first, so authentication, `current_user`
  and resource lookups work, and path params can be arguments.
- **It's internal:** it isn't an HTTP route, a tool or a prompt.
- **Failures stop the connection:** if it doesn't succeed, for example a filter responds
  403 or the room doesn't exist, `initialize` returns the error and no session is
  created. A 401 challenges the client to sign in again.
- **It must return a `String`:** this is checked at compile time. Return an empty string
  for no instructions.

Without the method, the controller's doc comment is used.

## Access control

Endpoints share the `MCPServer` configuration: authentication (`auth_probe`,
`resource_metadata`), forwarded headers, allowed origins and the
[tool result](configuration.md#tool-results) format. Each endpoint URL is its own
OAuth protected resource: `/.well-known/oauth-protected-resource/rooms/boardroom/mcp`
advertises `https://example.com/rooms/boardroom/mcp` as the resource.

Tool calls run the controller's filters, so check that the user can access the
resource in a `before_action`, as you would for the HTTP routes:

```crystal
@[AC::Route::Filter(:before_action)]
def check_room_access(room_id : String)
  raise AccessDenied.new unless current_user.can_access?(room_id)
end
```

!!! warning "The URL isn't a credential"
    Anyone who has the URL can connect, subject to authentication. Treat the bound
    params like any other user input and authorise every call.

## Dynamic capabilities

The tools are fixed by the controller's routes, but their results can be as dynamic as
you need. A common pattern for resources whose capabilities change at runtime is
three tools:

1. `capabilities`: what this resource can do right now, plus context for the model.
2. `function_schema(capability)`: the functions a capability offers, with their JSON
   schemas.
3. `call_function(capability, function, params)`: runs one.

The model discovers and calls functions through tool results, so it doesn't depend on
the client refreshing its tool list. PlaceOS uses this for its per-system AI
assistant endpoint.

## See also

- [MCP overview](README.md)
- [Annotation options](prompts.md)
- [Authentication](authentication.md)
- [Configuration](configuration.md)
