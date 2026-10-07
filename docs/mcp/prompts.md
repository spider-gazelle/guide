# Prompts and visibility

`@[AC::MCP]` controls how a controller or method appears to MCP clients:

| Option | Applies to | Effect |
|---|---|---|
| `prompt: true` | methods | the method is an MCP prompt rather than a route |
| `root: true` | controllers or methods | always available, without opening the toolbox |
| `hide: true` | controllers or methods | not exposed over MCP |
| `read_only: Bool` | controllers or methods | whether a tool only reads data. Defaults to `true` for GET routes |
| `endpoint: true` | controllers | also serves the controller as its own MCP server, see [controller endpoints](endpoints.md) |
| `ui: "path.html"` | controllers or methods | renders an HTML card for the tool's results, see [UI cards](ui.md) |
| `app_only: true` | controllers or methods | only cards can call the tool, it's hidden from the model |

Tools with `ui:` or `app_only: true` are root items unless annotated `root: false`.

On a controller, `root`, `hide` and `read_only` apply to every route and prompt in it. They aren't
inherited by subclasses, so annotate each controller. A method level annotation takes
precedence, so you can hide a controller but expose one route:

```crystal
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

[Prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts) are
reusable message templates that users pick in their MCP client, often shown as slash
commands. They're a good way to package your domain knowledge: what to ask, which tools to
use, and in what order.

```crystal
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
- **Arguments:** the method's arguments, described with `@[AC::Param::Info]`. They're
  required unless nilable or defaulted, exactly like route parameters.
- **Return type:** must be declared, and must be `String` (one user message) or
  `Array(AC::PromptMessage)` (a conversation).

### Conversations

Return messages to prime a multi-turn exchange:

```crystal
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

A prompt isn't an HTTP route, so it can't be reached over HTTP and isn't in your OpenAPI
document. Internally, though, it runs through the same pipeline as a route:

- **Parameters** are parsed and validated by the same converters, including `config:`
  and custom converters.
- **Filters** run: `before_action` authentication, loading records, and so on.
- **Exception handlers** apply.

So a prompt can safely load and embed data, such as the pull request above, with the
user's permissions enforced.

!!! warning
    A prompt that is also a route is a compile error, and so is a prompt without a
    `String` or `Array(AC::PromptMessage)` return type.

## Root tools and prompts

Toolboxes keep the model's context small, but a few tools are needed in almost every
session. Mark them `root: true`:

```crystal
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

Root items keep their `<toolbox>_<method>` names. A toolbox that only contains root items
isn't listed by `list_toolboxes`, as there's nothing to open.

## Hiding routes

Hide routes that aren't useful or safe for a model, such as health checks, webhooks,
binary downloads or large documents:

```crystal
# the OpenAPI document is for people and code generators, not models
@[AC::MCP(hide: true)]
@[AC::Route::GET("/openapi")]
def openapi : YAML::Any
  OPENAPI
end
```

!!! note "Hiding isn't access control"
    `hide: true` only removes a tool from the MCP listing; the HTTP route still works.
    Protect routes with [filters](../guides/filters.md) as usual. Tool calls run your
    filters too.

## Read only tools

A tool is read only if its route is a GET. Read only tools are hinted to clients
(`readOnlyHint`), and clients that can't see opened tools run them through
`call_read_only`, which ChatGPT, for example, runs without asking the user to confirm.
Everything else goes through `call_tool`. See [how agents see your API](README.md#how-agents-see-your-api).

Override it when the verb is misleading:

```crystal
class Reports < AC::Base
  base "/reports"

  # a search that takes its query in the body, it doesn't change anything
  @[AC::MCP(read_only: true)]
  @[AC::Route::POST("/search", body: :query)]
  def search(query : ReportQuery) : Array(Report)
    Report.search(query)
  end

  # generating a report is recorded and emails the owner
  @[AC::MCP(read_only: false)]
  @[AC::Route::GET("/:id/generate")]
  def generate(id : Int64) : Report
    Report.find!(id).generate!
  end
end
```

!!! warning "Mark GET routes with side effects"
    `call_read_only` runs any read only tool without the client asking for
    confirmation. If a GET route changes data, sends messages or runs commands, mark it
    `read_only: false`.

## See also

- [MCP overview](README.md)
- [Authentication](authentication.md)
- [Filters](../guides/filters.md)
