# Controllers and routing

A controller is a class that groups related routes, and a route is a method with an annotation saying which HTTP verb and path it handles. This page covers defining controllers, choosing their paths and matching requests to methods.

```
require "action-controller"

# Manages the comments on articles
class Comments < AC::Base
  base "/comments"

  # Lists the comments
  @[AC::Route::GET("/")]
  def index : Array(String)
    ["first!", "great article"]
  end

  # Returns a single comment
  @[AC::Route::GET("/:id")]
  def show(id : Int64) : String
    "comment #{id}"
  end
end

require "action-controller/server"
AC::Server.new.run

# GET /comments    # => ["first!","great article"]
# GET /comments/42 # => "comment 42"
```

The `id` in the path is matched to the `id` argument by name and converted to an `Int64` before the method runs. A request for `/comments/abc` never reaches your code. See [parameters](https://spider-gazelle.net/guides/parameters/index.md) for how arguments are parsed.

That one annotated method is the route, its parameter parsing and validation, its [OpenAPI](https://spider-gazelle.net/openapi/index.md) operation and its [MCP](https://spider-gazelle.net/mcp/index.md) tool. The doc comment above it becomes the operation summary and the tool description.

## Controllers

Every controller inherits from `AC::Base` (an alias for `ActionController::Base`). Most applications define an abstract base class for shared filters, responders and error handlers, and inherit from it:

```
require "action-controller"

# Abstract classes don't generate routes
abstract class Application < AC::Base
  # shared filters and error handlers go here
end

class Users < Application
  base "/users"

  @[AC::Route::GET("/")]
  def index : Array(String)
    ["alice", "bob"]
  end
end
```

Only concrete (non-abstract) classes generate routes. Filters, exception handlers and routes are all inherited, so a route defined on a parent is available on every concrete subclass at the subclass's base path.

Rules to keep in mind:

- An annotated method name must be unique within a class hierarchy. Redefining an annotated method that a parent already defines is a compile error.
- A route method can't accept a block. Only around filters take a block.
- Controller methods without an annotation are ordinary methods and aren't routable.

## Base path

`base` sets the path prefix for every route in the controller. If you leave it out, it's derived from the class name, with `::` becoming `/`:

| Class               | Default base          |
| ------------------- | --------------------- |
| `Users`             | `/users`              |
| `ExampleController` | `/example_controller` |
| `Api::V1::Users`    | `/api/v1/users`       |

```
class Welcome < AC::Base
  # serve from the root of the site
  base "/"

  @[AC::Route::GET("/")]
  def index : String
    "Hello World"
  end
end
```

The base can contain path parameters too. They're available to every route in the controller:

```
class Features < AC::Base
  base "/photos/:photo_id/features"

  # GET /photos/:photo_id/features
  @[AC::Route::GET("/")]
  def index(photo_id : Int64) : Array(String)
    ["faces", "landmarks"]
  end

  # GET /photos/:photo_id/features/:id
  @[AC::Route::GET("/:id")]
  def show(photo_id : Int64, id : Int64) : String
    "feature #{id} of photo #{photo_id}"
  end
end
```

## HTTP verbs

| Annotation                      | Handles                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@[AC::Route::GET(path)]`       | `GET`, and `HEAD` automatically                                                                       |
| `@[AC::Route::POST(path)]`      | `POST`                                                                                                |
| `@[AC::Route::PUT(path)]`       | `PUT`                                                                                                 |
| `@[AC::Route::PATCH(path)]`     | `PATCH`                                                                                               |
| `@[AC::Route::DELETE(path)]`    | `DELETE`                                                                                              |
| `@[AC::Route::OPTIONS(path)]`   | `OPTIONS`                                                                                             |
| `@[AC::Route::WebSocket(path)]` | WebSocket upgrades (a `GET`), see [WebSockets](https://spider-gazelle.net/guides/websockets/index.md) |

Every `GET` route also answers `HEAD` requests. The method runs as normal, and the status and headers are sent without a body.

```
class Articles < AC::Base
  base "/articles"

  @[AC::Route::GET("/")]
  def index : Array(String)
    ["hello"]
  end

  @[AC::Route::POST("/")]
  def create : String
    "created"
  end

  @[AC::Route::PUT("/:id")]
  def replace(id : Int64) : String
    "replaced #{id}"
  end

  @[AC::Route::PATCH("/:id")]
  def update(id : Int64) : String
    "updated #{id}"
  end

  @[AC::Route::DELETE("/:id")]
  def destroy(id : Int64)
    head :no_content
  end
end
```

## Path patterns

Paths are matched by [LuckyRouter](https://github.com/luckyframework/lucky_router). A path is joined to the controller's base, and each segment can be:

| Segment  | Meaning                                           | Example path    | Matches                                      |
| -------- | ------------------------------------------------- | --------------- | -------------------------------------------- |
| `name`   | literal text                                      | `/users`        | `/users`                                     |
| `:name`  | required parameter                                | `/users/:id`    | `/users/42`                                  |
| `?:name` | optional parameter                                | `/users/?:id`   | `/users` and `/users/42`                     |
| `*:name` | glob, captures the rest of the path including `/` | `/files/*:path` | `/files/a/b/c.txt` (`path` is `"a/b/c.txt"`) |

```
class Files < AC::Base
  base "/files"

  # GET /files/docs/readme.md # => "docs/readme.md"
  @[AC::Route::GET("/*:path")]
  def show(path : String) : String
    path
  end

  # GET /files/versions    # => "latest"
  # GET /files/versions/3  # => "3"
  @[AC::Route::GET("/versions/?:version")]
  def version(version : Int32? = nil) : String
    version ? version.to_s : "latest"
  end
end
```

A method argument receives the path parameter with the same name. An optional parameter's argument must be nilable or have a default. Path parameters take precedence over query parameters with the same name.

Optional segments match where they're written, one after another: `/users/?:user_id/groups/?:group_id` matches `/users/groups`, `/users/5/groups` and `/users/5/groups/9`. The OpenAPI document lists each of these paths.

Paths without parameters match with or without a trailing `/`.

Routes must not overlap. Two routes for the same verb whose paths differ only in a parameter's name, such as `/photos/:id/features` and `/photos/:photo_id/features`, raise `LuckyRouter::DuplicateRouteError` when the server starts.

## Multiple routes per method

Stack annotations to serve several paths from one method:

```
class Groups < AC::Base
  base "/"

  @[AC::Route::GET("/users/:user_id/groups")]
  @[AC::Route::GET("/groups")]
  def index(user_id : Int64? = nil) : String
    user_id ? "groups for user #{user_id}" : "all groups"
  end
end
```

When the paths differ only by an optional segment, `?:name` is simpler: `/users/?:user_id/groups` matches both `/users/groups` and `/users/5/groups`. Stacked annotations suit paths with different shapes, or routes that need different options such as `config:`.

- Each annotation is a separate operation in the OpenAPI document.
- In [MCP](https://spider-gazelle.net/mcp/index.md), a method is a single tool however many routes it has. The tool uses the method's first `GET` route, the same one the [path helper](#building-paths-to-routes) builds.

## Route options

Route annotations accept named options after the path. Each is covered in detail on the linked page.

| Option               | Example                                      | Purpose                                                                                                                                                  |
| -------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `body:`              | `body: :comment`                             | Parse the request body into this argument. See [parameters](https://spider-gazelle.net/guides/parameters/#request-bodies).                               |
| `status_code:`       | `status_code: HTTP::Status::CREATED`         | The response status, `200 OK` by default. See [responses](https://spider-gazelle.net/guides/responses/#status-codes).                                    |
| `status:`            | `status: {Error => HTTP::Status::NOT_FOUND}` | Map return types to status codes. See [responses](https://spider-gazelle.net/guides/responses/#status-codes).                                            |
| `content_type:`      | `content_type: "text/plain"`                 | Always respond with this content type, skipping `Accept` negotiation. See [responses](https://spider-gazelle.net/guides/responses/#fixed-content-types). |
| `config:`            | `config: {id: {base: 16}}`                   | Options for a parameter's converter. See [parameters](https://spider-gazelle.net/guides/parameters/#converter-options).                                  |
| `converters:`        | `converters: {tags: ConvertTags}`            | Use a custom converter for a parameter. See [parameters](https://spider-gazelle.net/guides/parameters/#custom-converters).                               |
| `map:`               | `map: {per_page: :perPage}`                  | Read an argument from a differently named parameter. See [parameters](https://spider-gazelle.net/guides/parameters/#renaming-parameters).                |
| `response_type:`     | `response_type: Array(Comment)`              | The response type used in the OpenAPI document, when it differs from the method's return type.                                                           |
| `execution_context:` | `execution_context: "reports"`               | Run the route on a named execution context. See [execution contexts](https://github.com/spider-gazelle/action-controller/blob/master/CONTEXTS.md).       |

## Building paths to routes

Every concrete controller gets a class method for each route method, named after the method. It builds the path, filling in path parameters from named arguments and adding any others as a query string:

```
Features.show(photo_id: 1, id: 2)              # => "/photos/1/features/2"
Features.show(photo_id: 1, id: 2, full: true)  # => "/photos/1/features/2?full=true"
Features.show(photo_id: 1)                     # raises AC::InvalidRoute (missing :id)
```

Arguments must be named. Combine the helper with `redirect_to`:

```
@[AC::Route::POST("/:photo_id/features")]
def create(photo_id : Int64) : Nil
  redirect_to Features.show(photo_id: photo_id, id: 3), status: :see_other
end
```

If a method has several routes, the helper builds just one of them: the first `GET` route. Without a `GET`, it's the first route in verb order (`POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`), not source order. Build paths to the others yourself.

## Macro DSL

Under the annotations is a lower-level macro DSL. It defines a route from a block, and you read parameters from `params` and send the response with `render` yourself:

```
class Photos < AC::Base
  base "/photos"

  # GET /photos/:id/features
  get "/:id/features", :features do
    id = params["id"]
    render json: ["faces in photo #{id}"]
  end

  # POST /photos/:id/feature
  post "/:id/feature", :add_feature do
    head :created
  end
end
```

The second argument names the generated method, so filters can refer to it with `only:` and `except:`. The macros are `get`, `post`, `put`, `patch`, `delete`, `options` and `ws`.

Prefer annotations. DSL routes get no typed parameters or validation, and they don't appear in the OpenAPI document or as MCP tools.

## Listing routes

`AC::Server.routes` returns every route as `{controller, method, verb, path}` tuples, and `AC::Server.print_routes` prints them as a table. The [application template](https://spider-gazelle.net/getting_started/index.md) wires this to a flag:

```
./bin/app --routes
```

## See also

- [Composable applications](https://spider-gazelle.net/guides/composition/index.md): mounting and combining controller subtrees
- [Parameters](https://spider-gazelle.net/guides/parameters/index.md): types, converters, headers and request bodies
- [Responses](https://spider-gazelle.net/guides/responses/index.md): status codes, responders and content types
- [Filters](https://spider-gazelle.net/guides/filters/index.md): code that runs before, around and after routes
- [Errors](https://spider-gazelle.net/guides/errors/index.md): turning exceptions into responses
- [WebSockets](https://spider-gazelle.net/guides/websockets/index.md)
- [OpenAPI](https://spider-gazelle.net/openapi/index.md) and [MCP](https://spider-gazelle.net/mcp/index.md)
