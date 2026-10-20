# Guides

The guides explain each part of a Spider-Gazelle app. If you're new, read them in order.
Each builds on the last. If you're experienced, jump to the topic you need.

| Guide | You'll learn |
|---|---|
| [Controllers & routing](routing.md) | defining routes with annotations, paths, verbs and redirect helpers |
| [Composable applications](composition.md) | combining apps, mounting controller subtrees, unified catalogs and the tradeoffs of handler chains |
| [Parameters](parameters.md) | typed parameters, converters, headers and request bodies |
| [Responses](responses.md) | responders, status codes, rendering, files and headers |
| [Filters](filters.md) | running code before, around and after actions |
| [Error handling](errors.md) | turning exceptions into helpful responses |
| [Sessions & cookies](sessions.md) | storing small amounts of state between requests |
| [WebSockets](websockets.md) | realtime connections |
| [Logging](logging.md) | structured logs, request IDs and changing log levels at runtime |
| [Testing](testing.md) | testing routes, controllers and your MCP server |

!!! tip "Everything you write here feeds OpenAPI and MCP"
    The doc comments, `@[AC::Param::Info]` annotations, argument types and return types
    you'll meet in these guides also generate your [OpenAPI](../openapi/README.md)
    document and [MCP tools](../mcp/README.md). Writing a good route is writing good
    documentation.
