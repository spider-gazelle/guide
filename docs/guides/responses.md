# Responses

A route method's return value is the response body. Spider-Gazelle picks a format from
the request's `Accept` header, serialises the value and sets the status code from the
route annotation. This page covers status codes, content negotiation, responders,
`render` and friends, headers, files, CORS and forcing TLS.

```crystal
require "action-controller"

struct Comment
  include JSON::Serializable

  getter id : Int64
  getter body : String

  def initialize(@id, @body)
  end
end

class Comments < AC::Base
  base "/comments"

  # Returns a comment
  @[AC::Route::GET("/:id")]
  def show(id : Int64) : Comment
    Comment.new(id, "great article")
  end

  # Creates a comment
  @[AC::Route::POST("/", status_code: HTTP::Status::CREATED)]
  def create(body : String) : Comment
    Comment.new(1_i64, body)
  end
end

require "action-controller/server"
AC::Server.new.run

# GET /comments/7          # => 200 {"id":7,"body":"great article"}
# POST /comments?body=hi   # => 201 {"id":1,"body":"hi"}
```

The return type is optional, but declare it. It documents the route, it's checked by
the compiler, and it's the response schema in the [OpenAPI](../openapi/README.md)
document and the [MCP](../mcp/README.md) tool's result.

## Return values

| Returned value | Response |
|---|---|
| an object | Serialised by the selected [responder](#responders). JSON by default, using `to_json`. |
| a `String` | Also serialised, so the default JSON responder sends `"text"` with quotes. Use a [`text/plain` responder](#fixed-content-types) for plain text. |
| `nil` | No body. The status code and headers are still sent. |
| anything, for a `HEAD` request | No body. |

If the method has already sent a response with [`render`, `head` or
`redirect_to`](#render-head-and-redirect_to), the return value is ignored.

## Status codes

Responses are `200 OK` unless you say otherwise. Set a different status for a route
with `status_code:`:

```crystal
@[AC::Route::POST("/", status_code: HTTP::Status::CREATED)]
def create(body : String) : Comment
  Comment.new(1_i64, body)
end
```

When a route can return different types, map each type to a status with `status:`.
Declare the return type as a union so the compiler, and the OpenAPI document, know
every possibility:

```crystal
struct Missing
  include JSON::Serializable

  getter error : String

  def initialize(@error)
  end
end

class Lookups < AC::Base
  base "/lookups"

  # Finds a comment
  @[AC::Route::GET("/:id", status: {Missing => HTTP::Status::NOT_FOUND})]
  def show(id : Int64) : Comment | Missing
    if id == 1
      Comment.new(id, "found it")
    else
      Missing.new("no comment #{id}")
    end
  end
end
```

The returned value's type selects the status, and types not in the map use
`status_code:` (default `200`). Both statuses appear as responses in the OpenAPI
operation.

Status values can be an `HTTP::Status` or an integer. For errors raised from deeper in
your code, [exception handlers](errors.md) are usually a better fit than return types.

## Content negotiation

The route picks a responder before your method runs:

1. With no `Accept` header, or `Accept: */*`, it uses the default responder
   (`application/json`).
2. Otherwise it uses the first type listed in `Accept` that has a responder. Quality
   values (`;q=0.8`) are ignored, so list order decides.
3. If none match and there's no `*/*`, it raises `AC::Route::NotAcceptable`, and your
   method isn't called. Its `accepts` lists the available types. Handle it to return a
   `406`, see [errors](errors.md#recommended-handlers).

The response `Content-Type` is set to the selected type, unless your method has
already set one.

## Responders

`add_responder` registers a responder for a content type. The block writes `result`
to `io`, the response:

```crystal
require "yaml"

abstract class Application < AC::Base
  add_responder("application/yaml") { |io, result| result.to_yaml(io) }
  add_responder("text/plain") { |io, result| result.to_s(io) }

  # used when the client doesn't ask for a format
  default_responder "application/json"
end
```

- The block can also take the controller name and the action name as symbols:
  `|io, result, controller, action|`.
- It runs in the context of the controller instance, so `request`, `response` and
  your helper methods are available.
- `default_responder` sets the type used when the client accepts anything. It must
  already have a responder.
- Responders are registered application-wide, whichever controller declares them.
  Declare them once, in your base class.
- Any route can be asked for any registered format, so every route's return type must
  support every responder. For YAML, include `YAML::Serializable` in your response
  types, or the application won't compile.

## Fixed content types

`content_type:` fixes a route's response type. The `Accept` header is ignored and the
response always has this `Content-Type`:

```crystal
abstract class Application < AC::Base
  add_responder("text/plain") { |io, result| result.to_s(io) }
end

class Health < Application
  base "/health"

  # GET /health  # => ok
  @[AC::Route::GET("/", content_type: "text/plain")]
  def index : String
    "ok"
  end
end
```

!!! warning "Register a responder for the content type"
    `content_type:` sets the header, but the body is still written by the responder
    registered for that type. If there isn't one, the default (JSON) responder writes
    it, so the route above would send `"ok"` in quotes with a `text/plain` header.

Exception handlers accept `content_type:` too.

## `render`, `head` and `redirect_to`

These macros send a response immediately and `return` from the method. They work in
annotated routes, [filters](filters.md) and exception handlers.

```crystal
class Accounts < AC::Base
  base "/accounts"

  @[AC::Route::GET("/:id")]
  def show(id : Int64) : String?
    head :not_found if id == 0
    redirect_to "/accounts/1", status: :moved_permanently if id == 99
    render :accepted, text: "account #{id}" if id == 2
    "account #{id}"
  end

  @[AC::Route::DELETE("/:id")]
  def destroy(id : Int64)
    head :no_content
  end
end
```

!!! note "Return types"
    `head` and `redirect_to` return `nil`, and `render` returns the value it rendered.
    A route that uses them needs a return type that allows those values, such as
    `String?`, or no return type at all.

### `render`

`render` takes an optional status and one body option:

| Option | Content type | Body |
|---|---|---|
| `json:` | `application/json` | `to_json`, or the string as-is |
| `yaml:` | `text/yaml` | `to_yaml`, or the string as-is |
| `xml:` | `application/xml` | `to_s` |
| `html:` | `text/html` | `to_s` |
| `text:` | `text/plain` | `to_s` |
| `binary:` | `application/octet-stream` | `to_s` |
| `template:`, `partial:` | `text/html` | a [Kilt](https://github.com/jeromegn/kilt) template from `src/views/` |

```crystal
render json: {status: "ok"}
render :created, json: comment
render HTTP::Status::ACCEPTED, text: "queued"
render :forbidden   # status only, no body
```

The status can be a symbol, an `HTTP::Status` or an integer. Symbols are snake case
status names: `:ok`, `:created`, `:no_content`, `:bad_request`, `:unauthorized`,
`:forbidden`, `:not_found`, `:unprocessable_entity` and so on. A `Content-Type`
already set on the response is kept.

### `head`

`head status` sends a status with no body, e.g. `head :no_content`.

### `redirect_to`

`redirect_to path, status: :found` sets the `Location` header. The status defaults to
`302 Found`. Symbols must be redirect statuses: `:moved_permanently`, `:found`,
`:see_other`, `:not_modified`, `:temporary_redirect` or `:permanent_redirect`. Build
paths with the [route helpers](routing.md#building-paths-to-routes).

### `respond_with`

`respond_with` chooses between several formats in the action itself. It's intended
for [macro DSL](routing.md#macro-dsl) routes, because annotated routes have already
negotiated the format before the method runs:

```crystal
get "/:id", :show do
  comment = Comment.new(params["id"].to_i64, "great article")

  respond_with do
    json comment
    text comment.body
  end
end
```

It uses the first option that the `Accept` header allows, or the first option listed
if there's no `Accept` header. If nothing matches, it responds `406 Not Acceptable`.

## Headers

`response` is the [`HTTP::Server::Response`](https://crystal-lang.org/api/latest/HTTP/Server/Response.html).
Set headers on it before the body is written:

```crystal
@[AC::Route::GET("/report")]
def report : Array(String)
  response.headers["Cache-Control"] = "no-store"
  response.headers["X-Report-Version"] = "2"
  ["row 1", "row 2"]
end
```

Set `response.content_type = "..."` to change the content type. The body is still
written by the negotiated responder.

To set headers on every response, use a [before filter](filters.md).

## Conditional requests and caching

`stale?` sets the `ETag` and `Last-Modified` headers and checks them against the
request's `If-None-Match` and `If-Modified-Since`. When the client's copy is current,
it responds `304 Not Modified` and returns `false`:

```crystal
@[AC::Route::GET("/:id")]
def show(id : Int64) : Comment?
  comment = Comment.new(id, "great article")
  updated_at = Time.utc(2024, 1, 1)

  if stale?(last_modified: updated_at, etag: %("comment-#{id}-v1"))
    comment
  end
end
```

`public: true` also marks the response `Cache-Control: public`.

Pass either validator on its own, or both. When a client sends both `If-None-Match`
and `If-Modified-Since`, both must match for a `304`:

```crystal
@[AC::Route::GET("/:id")]
def show(id : Int64) : Comment?
  comment = Comment.find!(id)
  comment if stale?(etag: %("comment-#{id}-#{comment.version}"))
end
```

## Files and streams

To send a file or other large data, set the headers, mark the response as rendered and
write to `response` directly. The data is streamed rather than held in memory:

```crystal
@[AC::Route::GET("/export.csv")]
def export : Nil
  response.content_type = "text/csv"
  response.headers["Content-Disposition"] = %(attachment; filename="export.csv")

  # tells Spider-Gazelle the response has been handled
  @__render_called__ = true

  File.open("/data/export.csv") do |file|
    IO.copy(file, response)
  end
end
```

Set `@__render_called__ = true` before writing. Otherwise Spider-Gazelle tries to set
the status and content type after your data has been sent. For data already in memory
as a `String`, `render binary: data` is simpler.

## CORS

Browsers only let pages call an API on another origin if the response carries
[CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) headers. Add them in a
before filter, and answer the browser's `OPTIONS` preflight requests:

```crystal
abstract class Application < AC::Base
  @[AC::Route::Filter(:before_action)]
  def set_cors_headers
    response.headers["Access-Control-Allow-Origin"] = "https://app.example.com"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
  end
end

# Answers CORS preflight requests for every path
@[AC::MCP(hide: true)]
class Preflight < Application
  base "/"

  @[AC::Route::OPTIONS("/*:path")]
  def preflight
    head :no_content
  end
end
```

The preflight route is hidden from [MCP](../mcp/README.md), as it isn't useful to an
agent. Browsers don't send credentials with a preflight request, so if your base class
has an authentication filter, skip it here with
[`skip_action`](filters.md#skipping-inherited-filters). Use `"*"` as the allowed
origin only for public APIs that don't use cookies.

## Forcing TLS

`force_tls` makes routes reject plain HTTP. A plain HTTP request is redirected
(`302`) to the same URL over `https://`, and a WebSocket request gets
`412 Precondition Failed`.

```crystal
class Payments < AC::Base
  base "/payments"

  # only these routes
  force_tls only: [:create, :destroy]
end

class Admin < AC::Base
  base "/admin"

  # every route except the health check
  force_tls except: [:health]
end
```

Without `only:` or `except:`, every route in the controller requires TLS:

```crystal
abstract class Application < AC::Base
  force_tls
end
```

How a request's protocol is determined:

- **Behind a proxy:** the `X-Forwarded-Proto` or `Forwarded` header describes the
  client's connection, so it takes precedence. Make sure your TLS-terminating proxy or
  load balancer sets one of them.
- **Serving TLS yourself:** a connection to a port that `ActionController::Server` bound
  with TLS (`Server.new(ssl_context, ...)`) is HTTPS.

`force_ssl` is an alias.

!!! note
    The no-options form and the TLS port detection need action-controller 8.3.3 or
    later.

## See also

- [Routing](routing.md): route options
- [Errors](errors.md): responses for exceptions
- [Filters](filters.md): setting headers for every route
- [Sessions](sessions.md): cookies and sessions
- [OpenAPI: describing routes](../openapi/descriptions.md#responses)
