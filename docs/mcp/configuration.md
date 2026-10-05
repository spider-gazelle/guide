# MCP configuration reference

All options are class properties on `ActionController::MCPServer`, usually set in
`src/config.cr`:

```crystal
ActionController::MCPServer.tap do |mcp|
  mcp.server_name = "my-app"
  mcp.server_version = "1.0.0"
end
```

## Server

| Option | Default | Purpose |
|---|---|---|
| `server_name` | `"action-controller"` | reported to clients on `initialize` |
| `server_version` | `"1.0.0"` | reported to clients on `initialize` |
| `instructions` | toolbox usage guidance | text given to the model on `initialize`. Describe your domain here |
| `description_path` | `"mcp.yml"` | the generated tool descriptions, relative to the working directory |
| `session_timeout` | `30.minutes` | idle sessions are discarded |
| `allowed_origins` | `[]` | browser origins allowed in addition to same-origin. `"*"` allows any |
| `forward_headers` | `["Authorization", "Cookie", "X-API-Key"]` | request headers copied onto tool calls and prompts |
| `excluded_response_headers` | noise, credentials, transport and browser policy headers | response headers left out of [tool results](#tool-results), matched case-insensitively. A trailing `*` matches a prefix |

## Authentication

Authentication is optional and off by default. It's enabled when `auth_probe`,
`authenticator` or `resource_metadata` is set. See [Authentication](authentication.md).

| Option | Default | Purpose |
|---|---|---|
| `auth_probe` | `nil` | a route requested in-process with the forwarded headers. A 2xx response means authenticated |
| `authenticator` | `nil` | `Proc(HTTP::Request, Bool)`, a custom check used instead of the probe |
| `auth_cache_ttl` | `1.minute` | how long a successful check is cached for each credential |
| `resource_metadata` | `nil` | `Proc(HTTP::Request, ResourceMetadata)`, which advertises your OAuth authorization server |

## Methods

| Method | Purpose |
|---|---|
| `mount(router, path = "/mcp")` | registers the endpoint (and the protected resource metadata) |
| `write_description(path)` | generates `mcp.yml` from the code. Needs the source code |
| `generate_description` | the same, returning the `Description` |
| `description=` | replaces the loaded description (`nil` reloads it), useful in specs |

## Transport details

- **Transport:** Streamable HTTP, for protocol versions `2025-11-25`, `2025-06-18` and
  `2025-03-26`.
- **`POST`:** returns `application/json`. When a request produces notifications (e.g.
  opening a toolbox) and the client accepts `text/event-stream`, the notifications are
  streamed ahead of the result.
- **`GET`:** with `Accept: text/event-stream`, opens a stream for server notifications.
- **`DELETE`:** ends the session.
- **Sessions:** identified by the `Mcp-Session-Id` header and stored in memory for each
  process. Deployments with multiple instances need sticky sessions.
- **`Origin` headers:** must be same-origin or listed in `allowed_origins`, which
  protects against DNS rebinding.
- **Unhandled exceptions:** are logged and returned as a generic `500` tool error.
  `Server.before` handlers (such as `ErrorHandler`) don't run for in-process tool calls.

## Tool results

A tool call returns the route's response as `{status, headers, body}`. The same JSON is
the text content (which most clients give the model) and `structuredContent`:

```json
{
  "status": 200,
  "headers": {"X-Total-Count": "120", "Link": "</api/users?page=2>; rel=\"next\""},
  "body": [{"id": 1, "name": "Steve"}]
}
```

- **`status`:** the HTTP status code.
- **`headers`:** the response headers, minus those matching `excluded_response_headers`.
  Left out when there are none. This is how the model sees pagination (`Link`,
  `X-Total-Count`, `Content-Range`), `Location` after a create, `Retry-After` and `ETag`.
- **`body`:** the parsed JSON, or the text of any other response. Left out when empty.
- **Errors:** a status of 400 or above sets `isError`, and the error body is returned in
  the same shape. A `401` when authentication is enabled challenges the client to sign in
  again instead.
- **Images and audio:** returned as an `image` or `audio` content block, followed by the
  envelope without a body.

By default these headers are excluded:

| Kind | Headers |
|---|---|
| Noise | `Date`, `Content-Length`, `X-Request-ID`, `Content-Type`, `Server`, `Vary`, `Cache-Control`, `Pragma`, `Expires`, `Alt-Svc` |
| Credentials | `Set-Cookie`, `Cookie`, `Authorization`, `WWW-Authenticate`, `Proxy-*` |
| Transport | `Connection`, `Keep-Alive`, `Transfer-Encoding`, `Content-Encoding`, `Trailer`, `Upgrade` |
| Browser policy | `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Access-Control-*` |

Add to the list, rather than replacing it, so credentials stay excluded:

```crystal
ActionController::MCPServer.excluded_response_headers += ["X-Runtime", "X-Internal-*"]
```

## See also

- [MCP overview](README.md)
- [Setup](setup.md)
- [action-controller README](https://github.com/spider-gazelle/action-controller#mcp-server)
