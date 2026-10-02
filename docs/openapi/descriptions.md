# Describing routes

This page shows how to make each operation in your OpenAPI document as useful as
possible. The same comments and annotations describe your [MCP tools](../mcp/README.md),
so this work pays off twice.

## Summaries and descriptions

Doc comments directly above a route become its summary and description:

- the **first line** is the summary;
- if there's more than one line, the **whole comment** is also the description.

```crystal
# Comments left on articles
class Comments < AC::Base
  base "/comments"

  # Lists every comment
  @[AC::Route::GET("/")]
  def index : Array(Comment)
    Comment.all
  end

  # Creates a comment
  #
  # The author is taken from the signed in user. Markdown is supported in the body.
  @[AC::Route::POST("/", body: :comment, status_code: HTTP::Status::CREATED)]
  def create(comment : Comment) : Comment
    comment.save!
  end
end
```

The comment above the **controller class** describes the controller's paths. It's
also used as the [MCP toolbox](../mcp/README.md#how-agents-see-your-api) description.

!!! warning "Keep developer notes out of doc comments"
    Everything in the doc comment is published. Put implementation notes in a separate
    comment block, separated from the doc comment by a blank line:

    ```crystal
    # NOTE: cached for 5 minutes, see CacheConfig

    # Lists every comment
    @[AC::Route::GET("/")]
    def index : Array(Comment)
    ```

Comments are inherited: if a method is defined on a parent controller, its doc comment
is used for the routes of every subclass.

## Parameters

Every method argument is a parameter. Its location comes from the route:

| Argument | Location | Required |
|---|---|---|
| Matches a `:name` segment | path | yes |
| Matches a `?:name` segment | path | no |
| Has `@[AC::Param::Info(header: "X-Name")]` | header | unless nilable or defaulted |
| The `body:` argument | request body | yes |
| Anything else | query (or form data) | unless nilable or defaulted |

Describe parameters with `@[AC::Param::Info]`:

```crystal
@[AC::Route::GET("/")]
def index(
  @[AC::Param::Info(description: "only return comments by this author", example: "steve")]
  author : String? = nil,
  @[AC::Param::Info(description: "maximum number of results", example: "20")]
  limit : Int32 = 20,
  @[AC::Param::Info(name: "q", description: "full text search", example: "crystal")]
  query : String? = nil,
  @[AC::Param::Info(header: "X-Tenant", description: "the tenant to query", example: "acme")]
  tenant : String? = nil,
) : Array(Comment)
```

| `Param::Info` option | Effect |
|---|---|
| `description:` | parameter description |
| `example:` | example value, as a string |
| `name:` | the public parameter name, when it differs from the argument (`?q=` → `query`) |
| `header:` | read from this request header rather than the query string |
| `class:`, `config:` | a [custom converter](../guides/parameters.md) and its options. The schema still comes from the argument type |

!!! note
    Whether a parameter is required comes from the type: nilable or defaulted
    arguments are optional, everything else is required. There's no `required:`
    option to keep in sync.

### Parameters from filters

Filters can take typed parameters too. When a filter applies to a route, its
parameters are added to that route's operation:

```crystal
abstract class Application < AC::Base
  @[AC::Route::Filter(:before_action)]
  def set_tenant(
    @[AC::Param::Info(header: "X-Tenant", description: "the tenant to use")]
    tenant : String,
  )
    @tenant = Tenant.find!(tenant)
  end
end
```

Every route in every controller inheriting from `Application` documents the `X-Tenant`
header.

## Request bodies

Name the argument that holds the body with `body:`:

```crystal
@[AC::Route::POST("/", body: :comment)]
def create(comment : Comment) : Comment
```

The request body schema is the argument's type. It's listed once for each content type
your app can parse (JSON by default; see [parsers](../guides/parameters.md)).

## Responses

The return type is the response schema. The status code defaults to `200`:

```crystal
# 201 Created, with a Comment body
@[AC::Route::POST("/", body: :comment, status_code: HTTP::Status::CREATED)]
def create(comment : Comment) : Comment

# 202 Accepted, with no body
@[AC::Route::DELETE("/:id", status_code: HTTP::Status::ACCEPTED)]
def destroy(id : Int64) : Nil
```

Map different return types to different status codes with `status:`. Each mapping is
documented as its own response:

```crystal
@[AC::Route::GET("/:id", status: {
  Comment         => HTTP::Status::OK,
  CommentRedirect => HTTP::Status::SEE_OTHER,
})]
def show(id : Int64) : Comment | CommentRedirect
```

Responses are listed for each content type your app can render (see
[responders](../guides/responses.md)). JSON and YAML responses reference the schema;
`text/*` responses are strings.

### Error responses

[Exception handlers](../guides/errors.md) that apply to a route add their responses to
its operation. Handlers in a base class document the errors for every route that
inherits them:

```crystal
abstract class Application < AC::Base
  # 404 Not Found, with a CommonResponse body, on every route
  @[AC::Route::Exception(AC::Error::NotFound, status_code: HTTP::Status::NOT_FOUND)]
  def not_found(error) : AC::Error::CommonResponse
    AC::Error::CommonResponse.new(error, backtrace: false)
  end
end
```

!!! tip "Declare return types"
    Without a return type the operation has no response schema. Declaring one also has
    the compiler check your method returns what you documented.

## What isn't included

- Routes defined with the macro DSL (`get "/" do ... end`) aren't documented. Use
  annotations for anything you want described.
- `@[AC::Route::OPTIONS]` routes aren't documented in 8.3.2.
- Handlers registered with [`rescue_from`](../guides/errors.md#rescue_from) don't add
  responses. Only annotated exception handlers do.
- MCP prompts (`@[AC::MCP(prompt: true)]`) aren't HTTP routes, so they aren't in the
  document.

## See also

- [Schemas](schemas.md)
- [Parameters guide](../guides/parameters.md)
- [Generating and serving](generating.md)
