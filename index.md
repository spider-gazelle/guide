# Spider-Gazelle

A fast, type-safe web framework for [Crystal](https://crystal-lang.org). You write ordinary, documented methods; Spider-Gazelle turns them into HTTP routes, validated parameters, an [OpenAPI](https://spider-gazelle.net/openapi/index.md) description and [MCP](https://spider-gazelle.net/mcp/index.md) tools for AI agents, all from that one source.

## One method, four jobs

```
class Rooms < AC::Base
  base "/rooms"

  # Books a meeting room
  @[AC::Route::POST("/:id/bookings", body: :booking, status_code: HTTP::Status::CREATED)]
  def book(
    @[AC::Param::Info(description: "the room to book", example: "lvl3-boardroom")]
    id : String,
    booking : Booking,
  ) : Booking
    Room.find!(id).book(booking)
  end
end
```

From that method you get:

|                | What you get                                                                                                        | Driven by                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **HTTP route** | `POST /rooms/:id/bookings`, returning `201 Created`                                                                 | the route annotation                     |
| **Validation** | `id` and the JSON body are parsed and type checked before your code runs. Bad input gets a 4xx with a helpful error | argument types                           |
| **OpenAPI**    | an operation with a summary, a described path parameter, and request and response schemas                           | the doc comment, `Param::Info` and types |
| **MCP tool**   | `rooms_book`, which an AI agent can call with the same validation and the same filters                              | all of the above                         |

Why this matters

Hand-written API docs and agent tool definitions drift from the code, and drifted docs are worse than none. Spider-Gazelle derives them from the code itself. Rename a parameter, change a type or update a comment, and the OpenAPI document and MCP tools update with it. There's one source of truth to review and test, and no second copy to forget.

## Highlights

- **Type-safe routing.** Parameters arrive as method arguments, already converted to `Int32`, `UUID`, `Time`, enums or your own types. There's no `params["id"]` boilerplate.
- **Self documenting.** [OpenAPI 3](https://spider-gazelle.net/openapi/index.md) is generated from your comments and types. Generate API clients in any language from it.
- **AI ready.** A built-in [MCP server](https://spider-gazelle.net/mcp/index.md) exposes your API to Claude, VS Code, Cursor and other agents. It includes progressive tool discovery, prompts, and OAuth sign-in.
- **Content negotiation.** Request bodies are parsed by `Content-Type` and responses rendered by `Accept`. JSON is the default; add YAML, XML or your own formats.
- **Fast.** It's compiled Crystal, with [LuckyRouter](https://github.com/luckyframework/lucky_router) route matching and optional multi-core execution contexts.
- **Simple to test.** The spec helper drives your app in-process, with no server to start.
- **You're in control.** There's no hidden magic in your project: you own the entry point, the CLI, the configuration and the server lifecycle.

## Choose your path

- **New to Spider-Gazelle?**

  Start with [Your first app](https://spider-gazelle.net/getting_started/index.md), then work through the [Guides](https://spider-gazelle.net/guides/index.md) in order.

- **Experienced Crystal developer?**

  Jump to [Routing](https://spider-gazelle.net/guides/routing/index.md), [Parameters](https://spider-gazelle.net/guides/parameters/index.md), [OpenAPI](https://spider-gazelle.net/openapi/index.md) and [MCP](https://spider-gazelle.net/mcp/index.md). The [API reference](https://spider-gazelle.net/Config/environment/index.md) has every macro and type.

- **Building with an AI agent?**

  Give your agent the [agent reference](https://spider-gazelle.net/ai/index.md), or point it at [`/llms-full.txt`](https://spider-gazelle.net/llms-full.txt) for the whole site in one file.

## Built by

[Place Technology](https://place.technology/), a team in Sydney and Brisbane, Australia. Spider-Gazelle powers the [PlaceOS](https://github.com/PlaceOS) smart building platform. The framework is developed on [GitHub](https://github.com/spider-gazelle).

## Example apps

- [Spider-Gazelle template](https://github.com/spider-gazelle/spider-gazelle): the starting point for new apps, with OpenAPI, MCP and Docker set up.
- [PlaceOS REST API](https://github.com/PlaceOS/rest-api): a large production API, with its [OpenAPI document](https://editor.swagger.io/?url=https://raw.githubusercontent.com/PlaceOS/rest-api/master/OPENAPI_DOC.yml) and an MCP server with OAuth sign-in.
- [PlaceOS Staff API](https://github.com/PlaceOS/staff-api), with its [OpenAPI document](https://editor.swagger.io/?url=https://raw.githubusercontent.com/PlaceOS/staff-api/master/OPENAPI_DOC.yml).
- [PlaceOS Core](https://github.com/PlaceOS/core).
- [Apple/Google Wallet abstraction](https://github.com/PlaceOS/wallet).
