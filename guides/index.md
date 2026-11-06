# Guides

The guides explain each part of a Spider-Gazelle app. If you're new, read them in order. Each builds on the last. If you're experienced, jump to the topic you need.

| Guide                                                                             | You'll learn                                                                                       |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Controllers & routing](https://spider-gazelle.net/guides/routing/index.md)       | defining routes with annotations, paths, verbs and redirect helpers                                |
| [Composable applications](https://spider-gazelle.net/guides/composition/index.md) | combining apps, mounting controller subtrees, unified catalogs and the tradeoffs of handler chains |
| [Parameters](https://spider-gazelle.net/guides/parameters/index.md)               | typed parameters, converters, headers and request bodies                                           |
| [Responses](https://spider-gazelle.net/guides/responses/index.md)                 | responders, status codes, rendering, files and headers                                             |
| [Filters](https://spider-gazelle.net/guides/filters/index.md)                     | running code before, around and after actions                                                      |
| [Error handling](https://spider-gazelle.net/guides/errors/index.md)               | turning exceptions into helpful responses                                                          |
| [Sessions & cookies](https://spider-gazelle.net/guides/sessions/index.md)         | storing small amounts of state between requests                                                    |
| [WebSockets](https://spider-gazelle.net/guides/websockets/index.md)               | realtime connections                                                                               |
| [Logging](https://spider-gazelle.net/guides/logging/index.md)                     | structured logs, request IDs and changing log levels at runtime                                    |
| [Testing](https://spider-gazelle.net/guides/testing/index.md)                     | testing routes, controllers and your MCP server                                                    |

Everything you write here feeds OpenAPI and MCP

The doc comments, `@[AC::Param::Info]` annotations, argument types and return types you'll meet in these guides also generate your [OpenAPI](https://spider-gazelle.net/openapi/index.md) document and [MCP tools](https://spider-gazelle.net/mcp/index.md). Writing a good route is writing good documentation.
