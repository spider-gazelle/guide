# MCP configuration reference

All options are class properties on `ActionController::MCPServer`, usually set in `src/config.cr`:

```
ActionController::MCPServer.tap do |mcp|
  mcp.server_name = "my-app"
  mcp.server_version = "1.0.0"
  # describe your domain, then how to use toolboxes (which explains the proxies when enabled)
  mcp.instructions = "Manages meeting rooms and bookings.\n\n#{mcp.toolbox_instructions}"
end
```

## Server

| Option                      | Default                                                  | Purpose                                                                                                                 |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `server_name`               | `"action-controller"`                                    | reported to clients on `initialize`                                                                                     |
| `server_version`            | `"1.0.0"`                                                | reported to clients on `initialize`                                                                                     |
| `instructions`              | `nil` (`toolbox_instructions`)                           | text given to the model on `initialize`. Describe your domain here and append `toolbox_instructions`. `""` sends none   |
| `ui_base`                   | `nil`                                                    | the folder of [UI cards](https://spider-gazelle.net/mcp/ui/index.md), `ui://` paths resolve against it                  |
| `ui_meta`                   | `nil`                                                    | the default card settings (`UIMeta`: CSP domains, permissions, border)                                                  |
| `tool_proxy`                | `true`                                                   | adds the `call_read_only` and `call_tool` meta tools, for clients that ignore `tools/list_changed`                      |
| `description_path`          | `"mcp.yml"`                                              | the generated tool descriptions, relative to the working directory                                                      |
| `session_timeout`           | `30.minutes`                                             | idle sessions are discarded                                                                                             |
| `allowed_origins`           | `[]`                                                     | browser origins allowed in addition to same-origin. `"*"` allows any                                                    |
| `forward_headers`           | `["Authorization", "Cookie", "X-API-Key"]`               | request headers copied onto tool calls and prompts                                                                      |
| `excluded_response_headers` | noise, credentials, transport and browser policy headers | response headers left out of [tool results](#tool-results), matched case-insensitively. A trailing `*` matches a prefix |

## Authentication

Authentication is optional and off by default. It's enabled when `auth_probe`, `authenticator` or `resource_metadata` is set. See [Authentication](https://spider-gazelle.net/mcp/authentication/index.md).

| Option              | Default    | Purpose                                                                                     |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `auth_probe`        | `nil`      | a route requested in-process with the forwarded headers. A 2xx response means authenticated |
| `authenticator`     | `nil`      | `Proc(HTTP::Request, Bool)`, a custom check used instead of the probe                       |
| `auth_cache_ttl`    | `1.minute` | how long a successful check is cached for each credential                                   |
| `resource_metadata` | `nil`      | `Proc(HTTP::Request, ResourceMetadata)`, which advertises your OAuth authorization server   |

## Methods

| Method                                           | Purpose                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mount(router, path = "/mcp", endpoints = true)` | registers the endpoint (and the protected resource metadata), plus the [controller endpoints](https://spider-gazelle.net/mcp/endpoints/index.md) |
| `mount_endpoints(router)`                        | registers just the [controller endpoints](https://spider-gazelle.net/mcp/endpoints/index.md)                                                     |
| `endpoint_paths`                                 | the path templates of the controller endpoints                                                                                                   |
| `icon(src, **fields)`                            | adds an icon for the global server, see [icons](https://spider-gazelle.net/mcp/prompts/#icons)                                                   |
| `toolbox_instructions`                           | the toolbox usage instructions, to append to your own `instructions`                                                                             |
| `write_description(path)`                        | generates `mcp.yml` from the code. Needs the source code                                                                                         |
| `generate_description`                           | the same, returning the `Description`                                                                                                            |
| `description=`                                   | replaces the loaded description (`nil` reloads it), useful in specs                                                                              |

## Transport details

- **Transport:** Streamable HTTP, for protocol versions `2025-11-25`, `2025-06-18` and `2025-03-26`.
- **`POST`:** returns `application/json`. When a request produces notifications (e.g. opening a toolbox) and the client accepts `text/event-stream`, the notifications are streamed ahead of the result.
- **`GET`:** with `Accept: text/event-stream`, opens a stream for server notifications.
- **`DELETE`:** ends the session.
- **Sessions:** identified by the `Mcp-Session-Id` header and stored in memory for each process. Deployments with multiple instances need sticky sessions.
- **`Origin` headers:** must be same-origin or listed in `allowed_origins`, which protects against DNS rebinding.
- **Unhandled exceptions:** are logged and returned as a generic `500` tool error. `Server.before` handlers (such as `ErrorHandler`) don't run for in-process tool calls.

## Tool results

A tool call returns the route's response as `{status, headers, body}`. The same JSON is the text content (which most clients give the model) and `structuredContent`:

```
{
  "status": 200,
  "headers": {"X-Total-Count": "120", "Link": "</api/users?page=2>; rel=\"next\""},
  "body": [{"id": 1, "name": "Steve"}]
}
```

- **`status`:** the HTTP status code.
- **`headers`:** the response headers, minus those matching `excluded_response_headers`. Left out when there are none. This is how the model sees pagination (`Link`, `X-Total-Count`, `Content-Range`), `Location` after a create, `Retry-After` and `ETag`.
- **`body`:** the parsed JSON, or the text of any other response. Left out when empty.
- **Errors:** a status of 400 or above sets `isError`, and the error body is returned in the same shape. A `401` when authentication is enabled challenges the client to sign in again instead.
- **Images and audio:** returned as an `image` or `audio` content block, followed by the envelope without a body.

By default these headers are excluded:

| Kind           | Headers                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Noise          | `Date`, `Content-Length`, `X-Request-ID`, `Content-Type`, `Server`, `Vary`, `Cache-Control`, `Pragma`, `Expires`, `Alt-Svc`                |
| Credentials    | `Set-Cookie`, `Cookie`, `Authorization`, `WWW-Authenticate`, `Proxy-*`                                                                     |
| Transport      | `Connection`, `Keep-Alive`, `Transfer-Encoding`, `Content-Encoding`, `Trailer`, `Upgrade`                                                  |
| Browser policy | `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Access-Control-*` |

Add to the list, rather than replacing it, so credentials stay excluded:

```
ActionController::MCPServer.excluded_response_headers += ["X-Runtime", "X-Internal-*"]
```

## See also

- [MCP overview](https://spider-gazelle.net/mcp/index.md)
- [Setup](https://spider-gazelle.net/mcp/setup/index.md)
- [action-controller README](https://github.com/spider-gazelle/action-controller#mcp-server)
