# OpenAPI

Spider-Gazelle generates an [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) description
of your API from the code you already write: route annotations, method signatures and doc
comments. There's no separate spec file to maintain.

```crystal
# Manages the comments on articles
class Comments < AC::Base
  base "/articles/:article_id/comments"

  # Lists the comments on an article
  #
  # Comments are returned newest first.
  @[AC::Route::GET("/")]
  def index(
    article_id : Int64,
    @[AC::Param::Info(description: "only return comments by this author", example: "steve")]
    author : String? = nil,
  ) : Array(Comment)
    Comment.for(article_id, author)
  end
end
```

That produces a `GET /articles/{article_id}/comments` operation with:

- a summary ("Lists the comments on an article") and a description;
- a required `article_id` path parameter (`integer`) and an optional, described
  `author` query parameter;
- a `200` response containing an array of `Comment`, with the `Comment` JSON schema
  generated from the class;
- a "Comments" tag, so the operation is grouped with the controller's other routes.

## Where each part comes from

| OpenAPI | Comes from |
|---|---|
| Path summary/description | doc comment on the controller class |
| Operation summary | first line of the method's doc comment |
| Operation description | the whole doc comment, when it's more than one line |
| `operationId`, tags | `Controller_method`, and the controller's name. Repeats get a `_2`, `_3`... suffix |
| Path parameters | `:name` segments in the route. Optional `?:name` and glob `*:name` segments are [listed as separate paths](descriptions.md#optional-path-segments) |
| Query parameters | other method arguments. Required unless nilable or defaulted |
| Header parameters | `@[AC::Param::Info(header: "X-Name")]` |
| Parameter description/example | `@[AC::Param::Info(description:, example:)]` |
| Parameter schemas | argument types (`Int32`, `UUID`, enums, `Time`, ...) |
| Request body | the `body:` argument's type, for each registered parser content type |
| Responses | the return type, `status_code:` and `status:` maps, and your exception handlers |
| Schemas | `JSON::Serializable` types and enums via [json-schema](https://github.com/spider-gazelle/json-schema), with `@[JSON::Field]` hints. Each is defined once under `components/schemas`, and referenced with `$ref` wherever it's used, including when nested |
| Filter parameters | arguments of the filters that apply to the route |

## Why it's worth it

!!! tip "One source of truth"
    The OpenAPI document is generated from the same code that handles requests, so it
    can't describe a parameter that doesn't exist or miss one that does. Change a type
    and the schema changes; rename an argument and the parameter is renamed. Reviewers
    read one diff and the docs are always current.

The document is generally useful too:

- Browse and try your API in [Swagger UI](https://editor.swagger.io/), Redoc or Scalar.
- Generate typed API clients for TypeScript, Python, Swift, Kotlin and more with
  [OpenAPI Generator](https://openapi-generator.tech/).
- Contract test, mock, and import into API gateways.

The same metadata also powers the [MCP server](../mcp/README.md). Improving your OpenAPI
descriptions improves the tools your AI agents see.

## In this section

- [Describing routes](descriptions.md): doc comments, parameters, headers, request
  bodies and responses.
- [Schemas](schemas.md): how types become JSON schema, and how to refine it.
- [Generating and serving](generating.md): the CLI, Docker builds, serving the
  document, client generation and troubleshooting.
