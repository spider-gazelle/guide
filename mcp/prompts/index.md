# Annotation options

`@[AC::MCP]` controls how a controller or method appears to MCP clients:

| Option                  | Applies to             | Effect                                                                                                                          |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `prompt: true`          | methods                | the method is an MCP prompt rather than a route                                                                                 |
| `root: true`            | controllers or methods | always available, without opening the toolbox                                                                                   |
| `hide: true`            | controllers or methods | not exposed over MCP                                                                                                            |
| `title: "Book a room"`  | methods                | the tool or prompt's display name                                                                                               |
| `behaviour: :read_only` | controllers or methods | what the tool does, see [behaviour](#behaviour)                                                                                 |
| `visibility: :card`     | controllers or methods | who can call the tool: `:model`, `:card` or both (the default)                                                                  |
| `endpoint: true`        | controllers            | also serves the controller as its own MCP server, see [controller endpoints](https://spider-gazelle.net/mcp/endpoints/index.md) |
| `ui: "path.html"`       | controllers or methods | renders an HTML card for the tool's results, see [UI cards](https://spider-gazelle.net/mcp/ui/index.md)                         |

Tools with `ui:` or `visibility: :card` are root items unless annotated `root: false`. Icons have their own annotation, see [icons](#icons).

On a controller, `root` and `hide` apply to every route and prompt in it, and `behaviour`, `visibility` and `ui` to every route. `title:` is only read on methods. They aren't inherited by subclasses, so annotate each controller. A method level annotation takes precedence, so you can hide a controller but expose one route:

```
@[AC::MCP(hide: true)]
class Internal < AC::Base
  # exposed even though the rest of the controller is hidden
  @[AC::MCP(hide: false)]
  @[AC::Route::GET("/status")]
  def status : String
    "ok"
  end
end
```

## Prompts

[Prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts) are reusable message templates that users pick in their MCP client, often shown as slash commands. They're a good way to package your domain knowledge: what to ask, which tools to use, and in what order.

```
class Welcome < AC::Base
  base "/"

  # Learn a surprising fact about a number
  @[AC::MCP(prompt: true, root: true)]
  def number_fact(
    @[AC::Param::Info(description: "the number to share a fact about", example: "42")]
    number : Int32,
    @[AC::Param::Info(description: "who the fact is for", example: "a curious five year old")]
    audience : String = "a general audience",
  ) : String
    <<-PROMPT
      Share one surprising fact about the number #{number}, explained for #{audience}.
      Use the welcome toolbox to confirm the number with this service first.
      PROMPT
  end
end
```

- **Description:** the doc comment is what users see in their client.
- **Arguments:** the method's arguments, described with `@[AC::Param::Info]`. They're required unless nilable or defaulted, exactly like route parameters.
- **Return type:** must be declared, and must be `String` (one user message) or `Array(AC::PromptMessage)` (a conversation).

### Conversations

Return messages to prime a multi-turn exchange:

```
# Review a pull request with the team's checklist
@[AC::MCP(prompt: true)]
def review(id : Int64) : Array(AC::PromptMessage)
  pr = PullRequest.find!(id)
  [
    AC::PromptMessage.user("Review pull request ##{id}: #{pr.title}\n\n#{pr.diff}"),
    AC::PromptMessage.assistant("I'll check it against the checklist. Which areas worry you most?"),
  ]
end
```

### Prompts run like routes

A prompt isn't an HTTP route, so it can't be reached over HTTP and isn't in your OpenAPI document. Internally, though, it runs through the same pipeline as a route:

- **Parameters** are parsed and validated by the same converters, including `config:` and custom converters.
- **Filters** run: `before_action` authentication, loading records, and so on.
- **Exception handlers** apply.

So a prompt can safely load and embed data, such as the pull request above, with the user's permissions enforced.

Warning

A prompt that is also a route is a compile error, and so is a prompt without a `String` or `Array(AC::PromptMessage)` return type.

## Root tools and prompts

Toolboxes keep the model's context small, but a few tools are needed in almost every session. Mark them `root: true`:

```
class Rooms < AC::Base
  # always listed, no need to open the rooms toolbox
  @[AC::MCP(root: true)]
  @[AC::Route::GET("/search")]
  def search(query : String) : Array(Room)
    Room.search(query)
  end
end

# every route and prompt in the controller is a root item
@[AC::MCP(root: true)]
class Me < AC::Base
end
```

Root items keep their `<toolbox>_<method>` names. A toolbox that only contains root items isn't listed by `list_toolboxes`, as there's nothing to open.

## Hiding routes

Hide routes that aren't useful or safe for a model, such as health checks, webhooks, binary downloads or large documents:

```
# the OpenAPI document is for people and code generators, not models
@[AC::MCP(hide: true)]
@[AC::Route::GET("/openapi")]
def openapi : YAML::Any
  OPENAPI
end
```

Hiding isn't access control

`hide: true` only removes a tool from the MCP listing; the HTTP route still works. Protect routes with [filters](https://spider-gazelle.net/guides/filters/index.md) as usual. Tool calls run your filters too.

## Behaviour

Hosts use a tool's behaviour to decide what to confirm with the user. It's inferred from the HTTP verb:

| Verb        | Behaviour                     |
| ----------- | ----------------------------- |
| GET         | `:read_only`                  |
| PUT         | `:idempotent`                 |
| DELETE      | `[:destructive, :idempotent]` |
| POST, PATCH | none                          |

Set `behaviour:` when the verb is misleading. It's a symbol or an array of `:read_only`, `:additive`, `:destructive`, `:idempotent`, `:open_world` and `:closed_world`, and it replaces the inferred behaviour. Contradictions, such as `:read_only` with `:destructive`, are compile errors.

```
class Reports < AC::Base
  base "/reports"

  # a search that takes its query in the body, it doesn't change anything
  @[AC::MCP(behaviour: :read_only)]
  @[AC::Route::POST("/search", body: :query)]
  def search(query : ReportQuery) : Array(Report)
    Report.search(query)
  end

  # generating a report is recorded and emails the owner
  @[AC::MCP(behaviour: [:additive, :open_world])]
  @[AC::Route::GET("/:id/generate")]
  def generate(id : Int64) : Report
    Report.find!(id).generate!
  end
end
```

| Behaviour                       | Hint sent to the host                                                   |
| ------------------------------- | ----------------------------------------------------------------------- |
| `:read_only`                    | `readOnlyHint: true`, otherwise `false`                                 |
| `:destructive` / `:additive`    | `destructiveHint: true` / `false`                                       |
| `:idempotent`                   | `idempotentHint: true`                                                  |
| `:open_world` / `:closed_world` | `openWorldHint: true` / `false`, whether it reaches outside your system |

Clients that can't see opened tools run read only tools through `call_read_only`, which ChatGPT, for example, runs without asking the user to confirm. Everything else goes through `call_tool`. See [how agents see your API](https://spider-gazelle.net/mcp/#how-agents-see-your-api).

Mark GET routes with side effects

`call_read_only` runs any read only tool without the client asking for confirmation. If a GET route changes data, sends messages or runs commands, give it a `behaviour:`, such as `[:additive, :open_world]`.

## Visibility

In hosts that support [UI cards](https://spider-gazelle.net/mcp/ui/index.md), `visibility:` controls who can call a tool:

| Visibility         | Model                     | Cards |
| ------------------ | ------------------------- | ----- |
| both (the default) | yes                       | yes   |
| `:card`            | no, hidden from the model | yes   |
| `:model`           | yes                       | no    |

Card only tools are root items by default, so cards can call them in any client, and the `call_tool` and `call_read_only` proxies refuse them. It isn't access control: a client can still call them by name, so protect them with filters like any other route.

## Titles

Tools and prompts are named `<toolbox>_<method>`. Give them a display name with `title:`, which hosts show instead:

```
@[AC::MCP(title: "Book a room")]
@[AC::Route::POST("/")]
def create(booking : Booking) : Booking
```

## Icons

Add icons with `@[AC::Icon]`, repeated for different sizes or themes:

```
@[AC::Icon(src: "icons/book.svg", sizes: ["any"])]
@[AC::Icon(src: "icons/book-dark.svg", sizes: ["any"], theme: "dark")]
@[AC::Route::POST("/")]
def create(booking : Booking) : Booking
```

- **`src`:** `https:` and `data:` URLs are sent as is. A file in the [UI folder](https://spider-gazelle.net/mcp/ui/index.md) (`ui_base`) is sent as a `data:` URL. Anything else is a path on the current host, `https://<host>/icons/book.svg`.
- **Other arguments** (`sizes`, `theme`, `mimeType`) are passed through as is.
- **On a controller,** icons are the default for its tools and prompts, and the icon of its toolbox and its [endpoint](https://spider-gazelle.net/mcp/endpoints/index.md) server.
- **The server's icon:** `ActionController::MCPServer.icon "icons/logo.svg", sizes: ["any"]`.

## Upgrading from earlier releases

These options were replaced in action-controller 8.14, and the old names are compile errors:

| Before                               | Now                                                     |
| ------------------------------------ | ------------------------------------------------------- |
| `read_only: true`                    | `behaviour: :read_only`                                 |
| `read_only: false`                   | a `behaviour:` without `:read_only`, e.g. `[:additive]` |
| `card_only: true` / `app_only: true` | `visibility: :card`                                     |

Regenerate `mcp.yml` after upgrading.

## See also

- [MCP overview](https://spider-gazelle.net/mcp/index.md)
- [Authentication](https://spider-gazelle.net/mcp/authentication/index.md)
- [Filters](https://spider-gazelle.net/guides/filters/index.md)
