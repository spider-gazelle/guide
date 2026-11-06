# Parameters

Route methods declare the values they need as typed arguments. Spider-Gazelle finds each value in the path, query string, form data or headers, converts it to the argument's type and rejects the request if it can't. This page covers where values come from, which types are supported, how to customise parsing and how to read request bodies.

```
require "action-controller"

class Search < AC::Base
  base "/search"

  # Searches the catalogue
  @[AC::Route::GET("/:category")]
  def index(
    category : String,
    @[AC::Param::Info(description: "the text to search for", example: "crystal")]
    q : String,
    @[AC::Param::Info(description: "results per page")]
    limit : Int32 = 20,
    in_stock : Bool? = nil,
  ) : String
    "#{category}: #{q}, limit #{limit}, in stock #{in_stock.inspect}"
  end
end

require "action-controller/server"
AC::Server.new.run

# GET /search/books?q=crystal                   # => "books: crystal, limit 20, in stock nil"
# GET /search/books?q=crystal&limit=5&in_stock=true
#                                               # => "books: crystal, limit 5, in stock true"
# GET /search/books                             # => AC::Route::Param::MissingError (q is required)
# GET /search/books?q=crystal&limit=many        # => AC::Route::Param::ValueError (limit isn't an Int32)
```

There's no `params["limit"].to_i` boilerplate. The method signature describes the request, and the same signature, with the `@[AC::Param::Info]` descriptions and examples, becomes the parameters in the [OpenAPI](https://spider-gazelle.net/openapi/descriptions/#parameters) document and the input schema of the [MCP](https://spider-gazelle.net/mcp/index.md) tool.

## Where values come from

Each argument is looked up by its name:

1. **Path:** a `:name`, `?:name` or `*:name` segment in the route.
1. **Query string:** `?name=value`.
1. **Form data:** fields of an `application/x-www-form-urlencoded` or `multipart/form-data` request body.

Path parameters take precedence over query parameters, which take precedence over form fields. If a name appears more than once, the first value is used, except by an [`Array` or `Set` argument](#arrays-and-sets), which takes every value.

Two kinds of argument are read from elsewhere:

- an argument named in the route's `body:` option is parsed from the [request body](#request-bodies);
- an argument annotated with `@[AC::Param::Info(header: "...")]` is read from a [request header](#header-parameters).

## Required and optional

Whether a parameter is required comes from its type and default, never from an annotation:

| Argument               | Required | When missing                            |
| ---------------------- | -------- | --------------------------------------- |
| `limit : Int32`        | yes      | raises `AC::Route::Param::MissingError` |
| `limit : Int32 = 20`   | no       | `20`                                    |
| `limit : Int32? = nil` | no       | `nil`                                   |
| `limit : Int32?`       | no       | `nil`                                   |

A value that's present but can't be converted raises `AC::Route::Param::ValueError`. For a nilable argument without strict parsing, an unparsable value becomes `nil` instead.

Both errors carry `parameter` (the name) and `restriction` (the expected type). Spider-Gazelle doesn't turn them into responses for you: without an [exception handler](https://spider-gazelle.net/guides/errors/#handling-parameter-errors) they become a `500 Internal Server Error`. The [application template](https://spider-gazelle.net/getting_started/index.md) includes handlers that respond with `422` and `400`.

Defaults must match the type exactly

Crystal doesn't widen integer literals in arguments, so an `Int64` argument needs an `Int64` default: `id : Int64 = 0_i64`, not `id : Int64 = 0`. The same applies to `UInt32` (`0_u32`), `Float32` (`0.0_f32`) and so on.

## Supported types

| Type                                     | Accepts                               | Notes                                                                                  |
| ---------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| `String`                                 | anything                              |                                                                                        |
| `Char`                                   | the first character                   |                                                                                        |
| `Bool`                                   | `true`, case-insensitive              | Any other value is `false`, never an error.                                            |
| `Int8` to `Int128`, `UInt8` to `UInt128` | integers                              |                                                                                        |
| `Float32`, `Float64`                     | decimals                              |                                                                                        |
| `BigInt`, `BigDecimal`, `BigFloat`       | big numbers                           |                                                                                        |
| `Time`                                   | ISO 8601, e.g. `2024-01-02T03:04:05Z` | Use `config:` for other formats.                                                       |
| `UUID`                                   | UUID strings                          |                                                                                        |
| any `Enum`                               | a member name or its integer value    | Names ignore case and underscores: `dark_green`, `DarkGreen` and `DARKGREEN` all work. |
| a union, e.g. \`Int64                    | String\`                              | any member type                                                                        |
| `Array(T)`, `Set(T)`                     | every repetition of the name          | Each element is converted as a `T`. See [arrays and sets](#arrays-and-sets).           |
| no type                                  | anything                              | Treated as `String?`.                                                                  |

Any other type needs a [custom converter](#custom-converters).

Union members are tried in Crystal's internal union order, which isn't necessarily the order you wrote. `String | Int64` tries `Int64` first, so `"12"` becomes an `Int64`, and `Float64 | Int64` always produces a `Float64`. Avoid unions whose members can parse the same value.

```
class Lookup < AC::Base
  base "/lookup"

  enum Colour
    Red
    Green
    Blue
  end

  # GET /lookup/42     # => "Int64"
  # GET /lookup/alice  # => "String"
  @[AC::Route::GET("/:id")]
  def show(id : Int64 | String) : String
    id.class.to_s
  end

  # GET /lookup/paint/green  # => "Green"
  # GET /lookup/paint/2      # => "Blue"
  @[AC::Route::GET("/paint/:colour")]
  def paint(colour : Colour) : String
    colour.to_s
  end
end
```

## Arrays and sets

An `Array(T)` or `Set(T)` argument is read from every repetition of its name, as in `?tag=new&tag=sale`. That's how browsers (`URLSearchParams`) and clients generated from the OpenAPI document send lists. Each element is converted as a `T` argument would be:

```
class Products < AC::Base
  base "/products"

  enum Size
    Small
    Medium
    Large
  end

  # GET /products?tag=new&tag=sale&size=small&size=small&size=large
  #   # => {"tag":["new","sale"],"size":["small","large"]}
  # GET /products
  #   # => {"tag":[],"size":null}
  @[AC::Route::GET("/")]
  def index(
    tag : Array(String) = [] of String,
    size : Set(Size)? = nil,
  ) : NamedTuple(tag: Array(String), size: Set(Size)?)
    {tag: tag, size: size}
  end
end
```

The rules:

- Elements can be any [supported type](#supported-types) except another array or set. A `Set` drops repeated values.
- Repeated fields in a form body (`application/x-www-form-urlencoded` or `multipart/form-data`) are read the same way.
- A missing name works as it does for other parameters: the default, `nil`, or a `MissingError` when the argument has neither.
- An element that can't be converted raises `ValueError`, and the message names its index and value: `invalid parameter value for 'id' at index 1: "x"`.
- [Converter options](#converter-options) apply to each element. `strict:` makes no difference, as an element that can't be converted always raises.
- Only query and form parameters can be collections. A path or header argument typed `Array` or `Set`, or a collection of collections such as `Array(Set(String))`, is a compile-time error naming the argument.
- The OpenAPI document describes the parameter as an array with `style: form` and `explode: true`. An MCP tool takes it as a JSON array, sending one value per element.

To read a single comma separated value instead, `?tag=new,sale`, give the argument a [custom converter](#custom-converters). A converter always receives the whole value.

## Converter options

The `config:` route option passes options to a parameter's converter, keyed by argument name:

```
class Options < AC::Base
  base "/options"

  # GET /options/FF?since=2024-01-02%20%2B10:00  # => [255, "2024-01-02 00:00:00 +10:00"]
  @[AC::Route::GET("/:id", config: {
    id:    {base: 16},
    since: {format: "%F %:z"},
  })]
  def show(id : Int32, since : Time? = nil) : Tuple(Int32, String)
    {id, since.to_s}
  end
end
```

| Type                 | Option                  | Default  | Effect                                                                                                                     |
| -------------------- | ----------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| integers             | `base`                  | `10`     | Number base, e.g. `16` for hex.                                                                                            |
|                      | `underscore`            | `false`  | Allow `1_000`.                                                                                                             |
|                      | `prefix`                | `false`  | Allow `0x`, `0b` and `0o` prefixes.                                                                                        |
|                      | `whitespace`            | `true`   | Allow surrounding whitespace.                                                                                              |
|                      | `strict`                | `true`   | Reject trailing characters.                                                                                                |
|                      | `leading_zero_is_octal` | `false`  | Treat `017` as octal.                                                                                                      |
| `Float32`, `Float64` | `whitespace`            | `true`   | Allow surrounding whitespace.                                                                                              |
|                      | `strict`                | `true`   | `strict: false` reads `4.5abc` as `4.5`.                                                                                   |
| `BigInt`             | `base`                  | `10`     | Number base.                                                                                                               |
| `Bool`               | `true_string`           | `"true"` | The value that means `true`.                                                                                               |
| `Time`               | `format`                | ISO 8601 | A [`Time::Format`](https://crystal-lang.org/api/latest/Time/Format.html) pattern, parsed as UTC unless it includes a zone. |
| `UUID`               | `variant`, `version`    | any      | Require a `UUID::Variant` or `UUID::Version`.                                                                              |
| enums                | `from_value`            | `false`  | Only accept the integer value.                                                                                             |
|                      | `strict`                | `false`  | Raise `ValueError` for an unparsable value instead of resolving to `nil`.                                                  |

When `config:` is given, only the first non-nil type of a union is used. For an [array or set](#arrays-and-sets), the options apply to each element: `config: {size: {from_value: true}}` reads `?size=0&size=2` as `[Small, Large]`.

The `strict: true` enum option matters for nilable enums. Without it, an unknown value is silently ignored:

```
class Paint < AC::Base
  base "/paint"

  enum Colour
    Red
    Green
  end

  # GET /paint?colour=red   # => "Red"
  # GET /paint              # => ""
  # GET /paint?colour=cyan  # => AC::Route::Param::ValueError
  @[AC::Route::GET("/", config: {colour: {strict: true}})]
  def index(colour : Colour? = nil) : String
    colour.to_s
  end
end
```

Options can also be set on the argument with `@[AC::Param::Info(config: {...})]`. If both are present, the route's `config:` wins, so a method with several routes can parse the same argument differently on each:

```
class Hex < AC::Base
  base "/hex"

  # GET /hex/255      # => 255
  # GET /hex/x/FF     # => 255
  @[AC::Route::GET("/:id")]
  @[AC::Route::GET("/x/:id", config: {id: {base: 16}})]
  def show(id : UInt64) : UInt64
    id
  end
end
```

## Describing parameters with `@[AC::Param::Info]`

`@[AC::Param::Info]` annotates a single argument. All of its keys are optional:

| Key            | Purpose                                                             |
| -------------- | ------------------------------------------------------------------- |
| `description:` | Describes the parameter in OpenAPI and MCP.                         |
| `example:`     | An example value, as a string, for OpenAPI and MCP.                 |
| `name:`        | The request parameter name, when it differs from the argument name. |
| `header:`      | Read the value from this request header instead.                    |
| `class:`       | A custom converter for this argument.                               |
| `config:`      | Options for the converter.                                          |

There's no `required:` key. Make an argument optional by giving it a default or a nilable type.

`@[AC::Param::Converter]` is the same annotation under another name. Use whichever reads better.

```
class Articles < AC::Base
  base "/articles"

  # Lists articles, newest first
  @[AC::Route::GET("/")]
  def index(
    @[AC::Param::Info(description: "filter by tag", example: "crystal")]
    tag : String? = nil,
    @[AC::Param::Info(description: "filter by author", example: "jake")]
    author : String? = nil,
    @[AC::Param::Info(description: "maximum number of articles", example: "20")]
    limit : UInt32 = 20_u32,
    @[AC::Param::Info(description: "number of articles to skip", example: "0")]
    offset : UInt32 = 0_u32,
  ) : Array(String)
    [] of String
  end
end
```

## Renaming parameters

Request parameters don't always make good Crystal names. Rename one with `name:` on the argument, or with the route's `map:` option (argument name to parameter name):

```
class Pages < AC::Base
  base "/pages"

  # GET /pages?perPage=50&q=docs
  @[AC::Route::GET("/", map: {per_page: :perPage})]
  def index(
    per_page : Int32 = 10,
    @[AC::Param::Info(name: "q")]
    query : String? = nil,
  ) : String
    "#{per_page} results for #{query}"
  end
end
```

The original argument name is no longer read: `?per_page=50` is ignored above.

## Header parameters

Set `header:` to read an argument from a request header. Required-ness, defaults and conversion work as they do for other parameters, and the header appears in the OpenAPI document:

```
require "uuid"

class Jobs < AC::Base
  base "/jobs"

  @[AC::Route::POST("/")]
  def create(
    @[AC::Param::Info(header: "X-Request-UUID", description: "an idempotency key", example: "ba714f86-cac6-42c7-8956-bcf5105e1b81")]
    request_id : UUID,
    @[AC::Param::Info(header: "X-Priority")]
    priority : Int32 = 5,
  ) : String
    "job #{request_id} at priority #{priority}"
  end
end
```

A missing required header raises `MissingError`, and a value that can't be converted raises `ValueError`, with the header name as the `parameter`.

## Custom converters

A converter is any class or struct with a `convert(raw : String)` method. Its `initialize` arguments are the options that `config:` can pass. Return `nil` when the value can't be converted, and Spider-Gazelle raises the usual parameter errors.

Attach a converter to an argument with `class:`, or to a route with `converters:`. A converter receives the whole value, so a converter for an `Array` reads one comma separated value rather than [repeated names](#arrays-and-sets). The OpenAPI document then marks the parameter `explode: false`, and an MCP tool sends its elements joined with commas (so an element can't contain a comma):

```
# Parses comma separated lists, e.g. "red, green,blue"
struct ConvertList
  def initialize(@separator : String = ",")
  end

  def convert(raw : String) : Array(String)
    raw.split(@separator).map(&.strip).reject(&.empty?)
  end
end

class Tags < AC::Base
  base "/tags"

  # GET /tags?tags=red,green  # => ["red","green"]
  @[AC::Route::GET("/")]
  def index(
    @[AC::Param::Info(class: ConvertList)]
    tags : Array(String) = [] of String,
  ) : Array(String)
    tags
  end

  # GET /tags/pipes?tags=red|green  # => ["red","green"]
  @[AC::Route::GET("/pipes", converters: {tags: ConvertList}, config: {tags: {separator: "|"}})]
  def pipes(tags : Array(String)) : Array(String)
    tags
  end
end
```

To use a converter for every argument of a type without naming it each time, define it as `AC::Route::Param::Convert` followed by the type name. Spider-Gazelle looks this up for any type it doesn't recognise:

```
record Commit, branch : String, sha : String

# used automatically for any `Commit` argument
struct AC::Route::Param::ConvertCommit
  # e.g. "main#742887"
  def convert(raw : String) : Commit?
    parts = raw.split('#', 2)
    Commit.new(parts[0], parts[1]) if parts.size == 2
  end
end

class Builds < AC::Base
  base "/builds"

  # GET /builds/main%23742887  # => "742887 on main"
  @[AC::Route::GET("/:commit")]
  def show(commit : Commit) : String
    "#{commit.sha} on #{commit.branch}"
  end
end
```

Explicit converters take precedence over the built-in ones, so they can also replace the parsing of a standard type such as `Bool`.

## Request bodies

Name an argument in the route's `body:` option to parse the request body into it. The argument's type must be deserialisable by the parser for the request's `Content-Type`. JSON is supported out of the box, using [`JSON::Serializable`](https://crystal-lang.org/api/latest/JSON/Serializable.html):

```
require "action-controller"

struct NewUser
  include JSON::Serializable

  getter name : String
  getter email : String
end

class Users < AC::Base
  base "/users"

  # Registers a user
  @[AC::Route::POST("/", body: :user, status_code: HTTP::Status::CREATED)]
  def create(user : NewUser) : String
    "welcome #{user.name}"
  end
end

# curl -X POST http://localhost:3000/users \
#   -H "Content-Type: application/json" \
#   -d '{"name": "Jim", "email": "jim@example.com"}'
# => "welcome Jim"
```

How the body is parsed:

- The parser is chosen by the request's `Content-Type`. Requests without one use the default parser (`application/json`).
- An unsupported `Content-Type` raises `AC::Route::UnsupportedMediaType`, whose `accepts` lists the supported types. [`consumes:`](#restricting-content-types) narrows the types a route accepts.
- A `String` body argument also accepts `text/plain`, and receives the raw body.
- A body argument typed `IO` or `Bytes` isn't parsed at all, see [raw bodies](#raw-bodies).
- A body that doesn't match the type raises the parser's error, e.g. `JSON::SerializableError` (a `JSON::ParseException`). Handle it to return a `400`, see [errors](https://spider-gazelle.net/guides/errors/#recommended-handlers).
- A request without a body uses the argument's default, if it has one. Otherwise it raises `MissingError`: `missing request body for 'user'`.
- The body type becomes the OpenAPI request body schema, and the MCP tool's `body` input.

The body argument can sit alongside path, query and header arguments:

```
@[AC::Route::PATCH("/:id", body: :changes)]
def update(id : Int64, changes : NewUser, notify : Bool = false) : String
  "updated #{id}"
end
```

### Adding parsers

`add_parser` registers a parser for another content type. The block receives the argument's type, the body `IO` and the request. `default_parser` sets the parser used when the request has no `Content-Type`:

```
require "yaml"

abstract class Application < AC::Base
  add_parser("application/yaml") do |klass, body_io, request|
    klass.from_yaml(body_io)
  end
end
```

Any route's body can arrive in any registered format, so every body type in the application must then support YAML too, e.g. by including `YAML::Serializable`, or the application won't compile. A route whose [`consumes:`](#restricting-content-types) leaves YAML out only needs the formats it lists.

Parsers and responders are application-wide

`add_parser`, `default_parser`, `add_responder` and `default_responder` register globally, whichever controller they appear in. Declare them once, in your base class.

### Restricting content types

`consumes:` lists the content types a route's body may arrive in: one type or an array. It's the request's counterpart of `content_type:`. A request in any other type raises `AC::Route::UnsupportedMediaType`, whose `accepts` lists the route's types, and the OpenAPI document lists only those types for the request body:

```
class Members < Application
  base "/members"

  # JSON only, even though the application also parses YAML,
  # so NewUser doesn't need to support YAML
  @[AC::Route::POST("/", body: :user, consumes: "application/json")]
  def create(user : NewUser) : String
    "welcome #{user.name}"
  end

  # JSON, or plain text with no parser
  @[AC::Route::POST("/notes", body: :note, consumes: ["application/json", "text/plain"])]
  def note(note : String) : String
    note
  end
end
```

Every type must have a registered parser. The exception is `text/plain` for a `String` body, which needs none. Listing a type with no parser, or using `consumes:` on a route without a `body:`, is a compile-time error.

### Raw bodies

A body argument typed `IO` or `Bytes` receives the request body as it is, with no parser. Use it for uploads, streams and anything you must read byte for byte, such as a webhook whose signature covers the exact body:

```
class Webhooks < Application
  base "/webhooks"

  # Receives a signed payment event
  @[AC::Route::POST("/payments", body: :payload, consumes: "application/json")]
  def payment(
    payload : Bytes,
    @[AC::Param::Info(header: "X-Signature")]
    signature : String,
  ) : Nil
    # verify `signature` against `payload` before parsing it
  end

  # Imports rows from a CSV file, without holding it all in memory
  @[AC::Route::POST("/import", body: :csv, consumes: "text/csv", content_type: "text/plain")]
  def import(csv : IO) : String
    count = 0
    while csv.gets
      count += 1
    end
    "imported #{count} rows"
  end
end
```

- `Bytes` reads the whole body. `IO` is the request body itself, so read it once and in the route.
- The argument must be typed exactly `IO` or `Bytes` (nilable is fine). A subclass such as `IO::Memory` is a compile-time error.
- Without `consumes:`, any content type is accepted. With it, a request in another type, or with no `Content-Type`, raises `UnsupportedMediaType`.
- The body isn't read as form data, even when its type is `application/x-www-form-urlencoded`, so filters and query parameters can't consume it before the route runs.
- The OpenAPI document describes the body as `type: string, format: binary`, in each type the route consumes, or as `application/octet-stream` without `consumes:`.
- As an [MCP tool](https://spider-gazelle.net/mcp/#whats-exposed), a raw body is a plain string sent in the first text type the route consumes (`text/*`, JSON, XML, YAML or a form). A route that only consumes binary types, or has no `consumes:`, isn't a tool, as a model can't write raw bytes in a JSON string.

### Binary types

A body argument whose type is IO serialisable, with a `T.from_io(io, format)` class method, is read straight from the request body with no parser. A [BinData](https://github.com/spider-gazelle/bindata) class is the usual example:

```
require "bindata"

class Packet < BinData
  endian big

  field id : UInt16
  field flags : UInt8
end

class Devices < Application
  base "/devices"

  # Accepts a packet and replies with it
  @[AC::Route::POST("/packets", body: :packet, consumes: "application/x-packet", content_type: "application/x-packet")]
  def echo(packet : Packet) : Packet
    packet
  end
end
```

- `byte_format:` sets the byte order passed to `from_io`, `IO::ByteFormat::SystemEndian` by default. A BinData class ignores it and uses its own `endian`, so it's for types that read the format they're given, e.g. `byte_format: IO::ByteFormat::LittleEndian`.
- Numbers are IO serialisable too, but stay JSON. So do `JSON::Serializable` types that also define `from_io`.
- These bodies behave like [raw bodies](#raw-bodies): `consumes:` is optional and requires a matching `Content-Type`, `max_body_bytes:` applies, the body isn't read as form data, and the OpenAPI document describes it as `type: string, format: binary`.
- The same types can be returned as [binary responses](https://spider-gazelle.net/guides/responses/#binary-responses).

### Limiting body size

`max_body_bytes:` limits a route's body argument, raw or parsed. A body over the limit raises `AC::Route::PayloadTooLarge`, whose `limit` is the limit in bytes. Handle it to respond with `413`, see [errors](https://spider-gazelle.net/guides/errors/#built-in-errors):

```
@[AC::Route::POST("/attachments", body: :file, consumes: ["application/pdf", "image/png"], max_body_bytes: 10_000_000)]
def attach(file : Bytes) : Int32
  file.size
end
```

A `Content-Length` over the limit is refused before any of the body is read. A body without one, such as a chunked upload, is counted as it's read, and refused as soon as it goes over. `max_body_bytes:` needs a `body:` argument; form data is read separately and isn't limited by it.

## Form data and file uploads

Fields of `application/x-www-form-urlencoded` and `multipart/form-data` bodies are parameters, just like query parameters:

```
class Signups < AC::Base
  base "/signups"

  # curl -X POST http://localhost:3000/signups -d "name=Jim&age=42"
  @[AC::Route::POST("/")]
  def create(name : String, age : Int32? = nil) : String
    "#{name} (#{age})"
  end
end
```

Files in a multipart body are available from `files`, a `Hash(String, Array(FileUpload))?` keyed by field name:

```
class Uploads < AC::Base
  base "/uploads"

  @[AC::Route::POST("/")]
  def create : Array(String)
    uploads = files.try(&.["attachment"]?) || return [] of String
    uploads.map do |upload|
      "#{upload.filename}: #{File.size(upload.file.path)} bytes"
    end
  end
end
```

Each `AC::BodyParser::FileUpload` has `name`, `filename`, `headers`, `size` (if the client sent it) and `file`, the temporary file holding the upload. `file` is already closed, so open it by path to read it: `File.open(upload.file.path)`. The temporary files are deleted once the request completes, so copy anything you want to keep.

## Reading the request directly

Typed arguments cover most needs, but the raw request is always available in a controller:

| Method                 | Returns                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `request`              | The [`HTTP::Request`](https://crystal-lang.org/api/latest/HTTP/Request.html), including `request.headers` and `request.body`. |
| `params`               | Path, query and form parameters combined, as `URI::Params`.                                                                   |
| `route_params`         | Path parameters only.                                                                                                         |
| `query_params`         | Query parameters only.                                                                                                        |
| `form_data`            | Form fields only, or `nil`.                                                                                                   |
| `files`                | Uploaded files, or `nil`.                                                                                                     |
| `request_content_type` | The request's media type, e.g. `"application/json"`.                                                                          |
| `accepts_formats`      | The media types in the `Accept` header.                                                                                       |
| `client_ip`            | The client's IP, using `X-Forwarded-For`, `X-Real-IP` or `Forwarded` when present.                                            |
| `request_protocol`     | `:https` or `:http`, based on `X-Forwarded-Proto` or `Forwarded`.                                                             |
| `cookies`, `session`   | See [sessions](https://spider-gazelle.net/guides/sessions/index.md).                                                          |
| `action_name`          | The name of the route method being run, as a `Symbol`.                                                                        |

`request.body` can only be read once, so don't read it in a route that also uses `body:` or form parameters. To work with the body yourself, prefer a [raw body](#raw-bodies) argument.

## See also

- [Routing](https://spider-gazelle.net/guides/routing/index.md): paths and route options
- [Responses](https://spider-gazelle.net/guides/responses/index.md): what happens to the return value
- [Errors](https://spider-gazelle.net/guides/errors/index.md): responding to parameter errors
- [Filters](https://spider-gazelle.net/guides/filters/#typed-parameters): typed parameters in filters
- [OpenAPI: describing routes](https://spider-gazelle.net/openapi/descriptions/index.md)
- [MCP](https://spider-gazelle.net/mcp/index.md)
