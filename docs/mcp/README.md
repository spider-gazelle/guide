# MCP server

Spider-Gazelle can expose your API to AI agents as a
[Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. Claude, VS Code,
Cursor and other MCP clients can then discover and call your routes as **tools**, and offer
your **prompts** to users. There are no tool definitions to write: they're generated from
the same annotations, types and doc comments that drive routing and
[OpenAPI](../openapi/README.md).

```shell
claude mcp add --transport http my-app http://localhost:3000/mcp
```

## Why it's built in

!!! tip "Your API is already the tool definition"
    Hand-written tool definitions duplicate your API, and they drift: a renamed
    parameter or a changed type quietly breaks the agent. In Spider-Gazelle the tool *is*
    the route:

    - the **description** is the method's doc comment;
    - the **input schema** is generated from the argument types, `@[AC::Param::Info]`
      and the request body type;
    - a **call** runs the real route in-process, with the same parameter parsing,
      filters (authentication!), error handlers and responders as an HTTP request.

    Improve a doc comment and your OpenAPI docs and agent tools both get better. Fix a
    validation bug and it's fixed for agents too.

## How agents see your API

Large APIs have hundreds of routes, and listing them all would fill the model's context
before it does any work. Spider-Gazelle uses **progressive disclosure** instead:

- **Toolboxes:** each controller is a toolbox, described by the controller's doc comment.
- **Starting tools:** a session starts with just five tools (three with
  `tool_proxy = false`), plus any [root items](prompts.md):

  | Tool | Purpose |
  |---|---|
  | `list_toolboxes` | lists the toolboxes, their descriptions, and tool and prompt counts |
  | `open_toolbox(name)` | adds a toolbox's tools and prompts to the session, returning the tool definitions |
  | `close_toolbox(name)` | removes them again |
  | `call_read_only(name, arguments)` | runs a read only tool from an open toolbox, or a root tool |
  | `call_tool(name, arguments)` | runs any tool from an open toolbox, or a root tool. Tools marked `visibility: :card` are refused by both proxies |

- **Loading on demand:** the model opens only the toolboxes it needs. The client is
  notified (`tools/list_changed`) and refreshes its tool list.
- **Clients that don't refresh:** some clients (currently including Claude and ChatGPT)
  ignore `tools/list_changed`, so opened tools never appear. `open_toolbox` also returns
  each tool's name, description, input schema and the proxy to run it with:
  `call_read_only` for [read only tools](prompts.md#behaviour), which clients can
  run without asking for confirmation, and `call_tool` for the rest. Proxied calls behave
  exactly like direct ones. Turn them off with `tool_proxy = false` once your clients
  support `list_changed`.
- **Root items:** anything marked `root: true` is always available without opening a
  toolbox. Use it for the few tools and prompts most sessions need.

```crystal
# Manage meeting rooms and their bookings
class Rooms < AC::Base
  base "/rooms"

  # Lists the rooms in a building
  @[AC::Route::GET("/")]
  def index(building_id : String) : Array(Room)
    Room.where(building_id: building_id).to_a
  end
end
```

Here the toolbox is `rooms` ("Manage meeting rooms and their bookings"), and opening it
adds the `rooms_index` tool ("Lists the rooms in a building").

## Naming

- **Toolbox names:** the snake case controller name. The module namespace shared by
  every controller is left out, so `MyApp::Api::Rooms` and `MyApp::Api::Rooms::Bookings`
  become `rooms` and `rooms_bookings`.
- **Tool and prompt names:** `<toolbox>_<method>`, such as `rooms_index`.
- **Multiple routes:** a method with several route annotations is one tool. It uses
  the method's first `GET` route, otherwise its first route in verb order (`POST`,
  `PUT`, `PATCH`, `DELETE`).

## What's exposed

| | Exposed? |
|---|---|
| Annotated routes (`@[AC::Route::GET]` etc.) | yes, as tools |
| Methods marked `@[AC::MCP(prompt: true)]` | yes, as [prompts](prompts.md) |
| Routes marked `@[AC::MCP(hide: true)]` | no |
| WebSocket and `OPTIONS` routes | no |
| Macro DSL routes (`get "/" do`) | no |

## Calls run as the user

Tool calls forward the client's `Authorization`, `Cookie` and `X-API-Key` headers to the
route, so your existing authentication applies to every call. For OAuth sign-in from MCP
clients, see [Authentication](authentication.md).

## In this section

- [Setup](setup.md): mounting the server, generating `mcp.yml`, connecting clients and
  testing.
- [Annotation options](prompts.md): prompts, `root`, `hide`, behaviour, visibility,
  titles and icons.
- [Controller endpoints](endpoints.md): serving a controller as its own MCP server, such
  as one per room or account.
- [UI cards](ui.md): interactive HTML cards for tool results (MCP Apps).
- [Authentication](authentication.md): API keys, and OAuth sign-in with multi_auth and
  authly.
- [Configuration](configuration.md): every option, and transport details.
