# Agent reference

A dense, self-contained summary of Spider-Gazelle (action-controller ~> 8.9) for AI coding
agents and experienced developers. Paste it into an agent's context, or point the agent at
[`/llms.txt`](https://spider-gazelle.net/llms.txt) (an index of the site) or
[`/llms-full.txt`](https://spider-gazelle.net/llms-full.txt) (the whole site as Markdown).

## Project conventions (template)

```text
src/app.cr          entry point: CLI flags (-b -p -w -r -c --docs --file --mcp), server start
src/config.cr       requires controllers, server, MCP; logging, handlers, sessions, MCP config
src/constants.cr    NAME, VERSION, env vars (SG_ENV, SG_SERVER_PORT, SG_MCP_PATH ...)
src/controllers/    application.cr (abstract base) + one class per resource
spec/               spec_helper.cr requires src/config.cr; AC::SpecHelper.client
```

- Controllers inherit from an abstract `Application < AC::Base` (the template calls it
  `App::Base`). Shared filters, responders and error handlers go there.
- `base "/path"` sets the controller's path. It defaults to the snake case class name.
- Build with `shards build`, test with `crystal spec`, and format with
  `crystal tool format`.

## Routes

```crystal
# Doc comment: first line is the OpenAPI summary; the whole comment is the MCP tool description
@[AC::Route::GET("/:id")]                      # GET POST PUT PATCH DELETE OPTIONS WebSocket
def show(id : Int64) : Model                   # args are params; the return type is the response schema
@[AC::Route::POST("/", body: :model, status_code: HTTP::Status::CREATED)]
def create(model : Model) : Model              # body: names the argument parsed from the request body
@[AC::Route::GET("/", status: {A => HTTP::Status::OK, B => HTTP::Status::ACCEPTED})]
def index : A | B                              # status codes mapped by return type
@[AC::Route::GET("/raw", content_type: "text/plain")]   # force the response type
@[AC::Route::GET("/:a", map: {value: :a})]     # argument `value` reads param `a`
@[AC::Route::GET("/:id", config: {id: {base: 16}})]     # converter options
@[AC::Route::GET("/:id", converters: {id: MyConverter})]
```

- Path segments: `:name` (required), `?:name` (optional) and `*:name` (glob).
- Params are taken from the path, then the query, then form data. Bodies use parsers
  chosen by `Content-Type`; responses use responders chosen by `Accept`.
- A parameter is required unless it's nilable or has a default.
- Built-in conversions: numbers, `String`, `Char`, `Bool`, `Time`, `Enum`, `UUID`,
  and unions. `Bool` is `true` only for `true` (any case); any other value is `false`.
  Arrays need a custom converter.
- `@[AC::Param::Info(description:, example:, name:, header:, class:, config:)]` sits on
  an argument. There's **no `required:`**.
- Multiple route annotations on one method are allowed. MCP exposes them as one tool
  using the first GET route.

## Filters and errors

```crystal
@[AC::Route::Filter(:before_action, except: [:index])]   # :before_action :around_action :after_action
def authenticate(@[AC::Param::Info(header: "Authorization")] auth : String) ...
@[AC::Route::Filter(:around_action)]
def transaction(&) Database.transaction { yield } end     # around filters must yield
skip_action :authenticate, only: :show
@[AC::Route::Exception(NotFound, status_code: HTTP::Status::NOT_FOUND)]
def not_found(error) : ErrorBody                          # handlers are inherited
```

- Missing or invalid params raise `AC::Route::Param::MissingError` / `ValueError`.
  Without an exception handler they become a `500`; the template maps them to `422`
  and `400`.
- `rescue_from Klass, :method` also works, but its handler must `render` itself and it
  adds nothing to OpenAPI. Prefer the annotation.

- `render` and `head` short-circuit an action or filter, e.g. `head :unauthorized`.
- Filters can take typed params, which also appear in OpenAPI and MCP.
- `force_tls` (alias `force_ssl`) redirects plain HTTP to HTTPS. Without `only:`/`except:`
  it covers every route. Proxy headers decide the protocol, otherwise a connection to a
  port `Server` bound with TLS is HTTPS.

## Sessions and cookies

- `session["key"] = value` stores `String`, `Int64`, `Float64` or `Bool` in an
  encrypted cookie; reads return that union, so use `.as(Int64?)` etc.
- `cookies` holds the cookies the client **sent**. Set or delete cookies on
  `response.cookies`.

## Responders and parsers

```crystal
abstract class Application < AC::Base
  add_responder("application/yaml") { |io, result| result.to_yaml(io) }
  default_responder "application/json"
  add_parser("application/yaml") { |klass, body_io| klass.from_yaml(body_io.gets_to_end) }
end
```

## OpenAPI

- `ActionController::OpenAPI.generate_open_api_docs(title:, version:, **info)` returns a
  NamedTuple; call `.to_yaml` on it.
- It needs the source code and `crystal docs` (comments are extracted at generation
  time), so generate at build time: `./app --docs --file=openapi.yml`.
- Only annotated routes are documented, not the DSL `get "/" do`. `OPTIONS` routes
  aren't documented either.
- Every `JSON::Serializable` type and enum is one component, `$ref`'d wherever it's used
  (nested too). Nilable refs are `allOf` + `type` + `nullable`, and self-referencing
  types work. Component names come from the full type name: `Shop::Item` → `Shop.Item`,
  `Page(Shop::Item)` → `Page-oShop.Item-c`.
- Optional (`?:`) segments match where they're written, one after another, and a glob
  (`*:`) may be left off; the document lists a path per matched route
  (`<operationId>_without_<x>` for the shorter ones). `Param::Info` examples are written as in a URL and typed by the
  schema; array query params are comma separated (`explode: false`).

## MCP

```crystal
require "action-controller/mcp"
ActionController::MCPServer.mount(server, "/mcp")           # in app.cr
ActionController::MCPServer.write_description("mcp.yml")    # at build time (needs source)

@[AC::MCP(hide: true)]            # exclude a route/controller
@[AC::MCP(root: true)]            # available without opening the toolbox
@[AC::MCP(read_only: false)]      # a GET with side effects (true: a POST that only reads)
@[AC::MCP(endpoint: true)]        # class only: also its own MCP server at <base>/mcp, base path params bound from the URL
@[AC::MCP(prompt: true)]          # a prompt; must return String or Array(AC::PromptMessage)
```

- Controllers are toolboxes and each route method is one tool named
  `<toolbox>_<method>`. The module namespace shared by all controllers is left out of
  the names.
- WebSocket, `OPTIONS` and DSL routes aren't exposed as tools.
- Tool calls run the real route in-process, with the same filters and the same auth.
  `Authorization`, `Cookie` and `X-API-Key` are forwarded.
- Auth is optional: `auth_probe = "/users/current"`, plus `resource_metadata` for OAuth.
- Meta tools: `list_toolboxes`, `open_toolbox` (returns tool definitions), `close_toolbox`
  and two proxies for clients that ignore `tools/list_changed`: `call_read_only` (read only
  tools, `readOnlyHint: true`) and `call_tool` (anything). `tool_proxy = false` disables them.
  Read only = GET unless overridden with `read_only:`. Custom `instructions` should append
  `MCPServer.toolbox_instructions`.
- Tool results are `{status, headers, body}` (text and `structuredContent`). Headers
  matching `excluded_response_headers` (noise, cookies, credentials, transport) are left
  out, so return pagination as headers (`Link`, `X-Total-Count`) or in the body.

## Testing

```crystal
client = AC::SpecHelper.client                      # in-process HTTP client
client.get("/users/1", headers: HTTP::Headers{"Accept" => "application/json"})
controller = Users.spec_instance(HTTP::Request.new("GET", "/"))   # unit test an instance
```

## Common mistakes

| Mistake | Fix |
|---|---|
| Developer notes in the doc comment above a route | they're published to OpenAPI and MCP; separate them with a blank line |
| No return type on a route | there's no response schema, and the compiler can't check what's returned |
| `@[AC::Param::Info(required: true)]` | doesn't exist; make the type non-nilable without a default |
| Generating docs from a deployed binary | generate at build time where the source and `crystal` are available |
| An exposed route is unsafe for agents | `@[AC::MCP(hide: true)]` and protect it with filters |
| Expecting `hide: true` to block access | it only hides the MCP tool; the HTTP route still works |
| A GET route that changes data | mark it `@[AC::MCP(read_only: false)]`, or `call_read_only` runs it without confirmation |
| No handler for `Param::MissingError` / `ValueError` | bad input becomes a `500`; add `@[AC::Route::Exception]` handlers in the base class |
| Setting a cookie with `cookies["x"] = ...` | `cookies` is the request's; use `response.cookies << HTTP::Cookie.new(...)` |
| `session["id"] = 42` (an `Int32`) | doesn't compile; store `42_i64` |

## See also

- [Routing](../guides/routing.md), [Parameters](../guides/parameters.md),
  [Responses](../guides/responses.md), [Filters](../guides/filters.md) and
  [Errors](../guides/errors.md) for the full rules behind this summary
- [OpenAPI](../openapi/README.md) and [MCP](../mcp/README.md)
- [Configuration](../getting_started/configuration.md) for the template's CLI flags and
  environment variables
