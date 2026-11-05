# Server Cards

Every MCP server you mount publishes an
[MCP Server Card](https://modelcontextprotocol.io/seps/2127-mcp-server-cards): a small,
public JSON document that tells clients and registries how to connect before they
connect. You don't need to configure anything. The card is built from the same settings
the server reports once connected, so the two can't drift apart.

```crystal
require "action-controller"
require "action-controller/mcp"

ActionController::MCPServer.tap do |mcp|
  # all optional, see Settings below
  mcp.server_name = "com.example/rooms"
  mcp.server_version = "1.2.0"
  mcp.server_title = "Room Bookings"
  mcp.server_description = "Find, book and manage meeting rooms"
  mcp.website_url = "https://example.com/docs"
end

server = ActionController::Server.new
ActionController::MCPServer.mount(server, "/mcp")
server.run
```

`GET https://rooms.example.com/mcp/server-card` then returns:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
  "name": "com.example/rooms",
  "description": "Find, book and manage meeting rooms",
  "version": "1.2.0",
  "title": "Room Bookings",
  "websiteUrl": "https://example.com/docs",
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://rooms.example.com/mcp",
      "supportedProtocolVersions": ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]
    }
  ]
}
```

## What a card contains

A card describes the server and where to connect, nothing more:

| Field | Source |
|---|---|
| `name` | `server_name`, in reverse-DNS form, see [Naming](#naming) |
| `version` | `server_version` |
| `description` | `server_description`, see [Descriptions](#descriptions) |
| `title` | `server_title`, left out when it's not set |
| `websiteUrl` | `website_url`, left out when it's not set |
| `icons` | the server's [icons](prompts.md#icons), resolved against the request host |
| `remotes` | the server's public Streamable HTTP URL and the protocol versions it supports |

Tools, resources and prompts are **never** in the card. They can depend on the signed in
user, so clients list them once connected, as usual. Authentication isn't in the card
either: clients discover it by connecting, receiving a `401`, and following the
[protected resource metadata](authentication.md).

`server_title` and `website_url` are also reported in `serverInfo` (`initialize` and
`server/discover`) when they're set, so clients see the same identity before and after
connecting.

## Where cards are served

Each server's card is served at its path plus `/server-card`, the location the MCP
specification recommends:

| Server | Card |
|---|---|
| `mount(server, "/mcp")` | `/mcp/server-card` |
| [controller endpoint](endpoints.md) at `/rooms/:room_id/mcp` | `/rooms/boardroom/mcp/server-card`, describing `/rooms/boardroom/mcp` |
| controller endpoint at a custom path, `endpoint: "/assistant"` | `/rooms/boardroom/assistant/server-card` |

The `remotes` URL is the public URL of the server, built from the request's `Host` and
`X-Forwarded-Proto` headers, the same way as the
[protected resource metadata](authentication.md). Behind a proxy, forward both headers.
A single deployment serving many domains gets a correct card on each of them.

## Naming

Card names must be in reverse-DNS form, a namespace and a name separated by one slash
(`com.example/rooms`). You don't have to choose one:

- **`server_name` with a namespace** is used as is: `com.example/rooms`.
- **`server_name` without one** is given the request host's, reversed. The default name,
  `action-controller`, served on `rooms.example.com` is `com.example.rooms/action-controller`.
  The port and any trailing dot are ignored, and the host is lowercased.
- **Hosts that aren't domain names** (`localhost`, IP addresses) use the namespace
  `local`: `local/action-controller`.
- **Controller endpoints** share the namespace, followed by the controller's name:
  `com.example/room` or `com.example.rooms/room`.

Only the card is namespaced: `serverInfo` reports `server_name` exactly as you set it.

!!! tip
    Set a namespaced `server_name` when the server should have one stable name across
    every domain it's served on. Leave it unset or plain for multi-tenant deployments
    where each customer domain should be its own publisher.

`server_name` is an identifier, `server_title` is the name people see. Clients display the
`name` when there's no title, so set a title once your name is in reverse-DNS form:
`com.example/rooms` and `Room Bookings`.

## Descriptions

A card must have a description of 100 characters or less:

- **The global server** uses `server_description`, then `server_title`, then
  `server_name`.
- **Controller endpoints** use the first paragraph of the controller's doc comment, the
  same comment that describes its toolbox. Without one, the endpoint's name.
- **Long descriptions** are cut to 100 characters, ending in `…`.

Describe what the server does, not how it's built: "Find, book and manage meeting rooms".

## HTTP behaviour

Cards are public, read-only metadata, so they're served to anyone:

- **No authentication:** cards are served even when [authentication](authentication.md)
  is enabled.
- **Media type:** `application/mcp-server-card+json`.
- **CORS:** `Access-Control-Allow-Origin: *`, so browser based clients can read them.
  `OPTIONS` answers preflight requests with `204`.
- **Caching:** `Cache-Control: public, max-age=3600` (from `server_card_ttl`) and an
  `ETag`. A request with a matching `If-None-Match` is answered `304 Not Modified`.
- **`HEAD`:** supported, like every `GET` route.

!!! warning
    Anything in a card is public. Don't put credentials, internal hostnames or
    customer data in `server_title`, `server_description` or `website_url`.

## Settings

All of these are optional class properties on `ActionController::MCPServer`:

| Option | Default | Purpose |
|---|---|---|
| `server_name` | `"action-controller"` | the server's identifier. The card adds the host's namespace when it has none |
| `server_version` | `"1.0.0"` | the server's version, ideally semantic |
| `server_title` | `nil` | the display name, in the card and `serverInfo` |
| `server_description` | `nil` | the card's description, 100 characters or less |
| `website_url` | `nil` | the server's homepage or documentation, in the card and `serverInfo` |
| `server_card` | `true` | serves cards. `false` registers no `/server-card` routes |
| `server_card_ttl` | `1.hour` | the card's `Cache-Control` `max-age` |

Set `server_card` before calling `mount`, the routes are registered when the server is
mounted. `mount` raises `ArgumentError` if one of your own routes already uses a card's
path.

## Making servers discoverable

Clients don't guess where cards are. They find them in a catalog published for your
domain, such as an [Agentic Resource Discovery](https://agenticresourcediscovery.org)
manifest at `/.well-known/ard.json`. List each server with the
`application/mcp-server-card+json` type and its card's URL:

```json
{
  "entries": [
    {
      "identifier": "urn:air:example.com:mcp:rooms",
      "displayName": "Room Bookings",
      "type": "application/mcp-server-card+json",
      "url": "https://rooms.example.com/mcp/server-card",
      "description": "Find, book and manage meeting rooms",
      "representativeQueries": [
        "find a free room for six people at 2pm",
        "book the boardroom tomorrow morning"
      ]
    }
  ]
}
```

The catalog is site-wide, so serve it from whichever app owns your domain's
`/.well-known` paths.

## See also

- [MCP overview](README.md)
- [Controller endpoints](endpoints.md)
- [Authentication](authentication.md)
- [Configuration](configuration.md)
