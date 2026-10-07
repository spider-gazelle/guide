# UI cards

Tools can render an interactive card in the conversation instead of just text. Cards
use the official [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) extension,
supported by Claude, ChatGPT, VS Code, Microsoft 365 Copilot and others. Clients without
it show the tool's text result as usual.

A card is a static HTML file. Point a route at it with `ui:`:

```crystal
class Bookings < AC::Base
  base "/bookings"

  # Shows a booking
  @[AC::MCP(ui: "bookings/card.html")]
  @[AC::Route::GET("/:id")]
  def show(id : String) : Booking
    Booking.find!(id)
  end
end
```

and tell the MCP server where the cards are:

```crystal
ActionController::MCPServer.ui_base = "./cards" # cards/bookings/card.html
```

The template keeps its cards in `cards/`, next to `www/`. Set `SG_MCP_UI` to change it.

## How it works

1. The tool's definition points at the card, `ui://bookings/card.html`.
2. When the tool is called, the host reads the card with `resources/read` and renders
   it in a sandboxed iframe.
3. The host sends the card the tool's arguments, then its result. The result is the
   [`{status, headers, body}` envelope](configuration.md#tool-results), as
   `structuredContent`.

Cards can also call tools through the host, for example to refresh their data or act on
a button press.

## Writing a card

Cards are self-contained HTML5 documents that talk to the host with JSON-RPC over
`postMessage`. You can use the `@modelcontextprotocol/ext-apps` SDK, or the protocol
directly:

```html
<!DOCTYPE html>
<html>
<body>
  <h1 id="title">Loading…</h1>
  <script>
    const send = (message) => window.parent.postMessage({ jsonrpc: "2.0", ...message }, "*");

    window.addEventListener("message", ({ data }) => {
      if (data?.id === 1) {
        // initialized, the host now sends the tool input and result
        send({ method: "ui/notifications/initialized" });
      } else if (data?.method === "ui/notifications/tool-result") {
        const booking = data.params.structuredContent.body;
        document.getElementById("title").textContent = booking.title;
      }
    });

    send({ id: 1, method: "ui/initialize", params: {
      protocolVersion: "2026-01-26",
      appInfo: { name: "booking-card", version: "1.0.0" },
      appCapabilities: {},
    } });
  </script>
</body>
</html>
```

The template's `cards/welcome/result.html` is a complete example: it follows the host's
theme and reports its size so the host can fit the frame to it.

- **Theme:** the `ui/initialize` result includes `hostContext.theme` (`light` or `dark`)
  and CSS variables such as `--color-text-primary` in `hostContext.styles.variables`.
- **Size:** send `ui/notifications/size-changed` with the content height.
- **Calling tools:** send a `tools/call` request, for example to refresh the card's data.

## Card settings

By default hosts run cards with a strict content security policy: inline scripts and
styles only, no external resources and no network requests. Declare anything a card
needs with `ui_meta`, the default for every card:

```crystal
ActionController::MCPServer.ui_meta = ActionController::MCPServer::UIMeta.new(
  prefers_border: true,
  csp: ActionController::MCPServer::UICSP.new(resource_domains: ["https://cdn.example.com"]),
)
```

or for a single card, with a `.meta.json` file next to it, which replaces the default:

```json
// cards/bookings/card.meta.json
{"csp": {"connectDomains": ["https://api.example.com"]}, "prefersBorder": false}
```

| Setting | Purpose |
|---|---|
| `csp.connectDomains` | origins the card can `fetch` from |
| `csp.resourceDomains` | origins for scripts, styles, images, fonts and media |
| `csp.frameDomains` | origins the card can embed |
| `csp.baseUriDomains` | allowed base URIs |
| `permissions` | browser permissions to request, e.g. `{"clipboardWrite": {}}`. Hosts may refuse |
| `domain` | a dedicated sandbox origin, host specific |
| `prefersBorder` | whether the host draws a border around the card |

## Tools only cards call

Mark tools a card uses, but the model shouldn't, with `card_only: true`. Hosts hide them
from the model:

```crystal
# Checks in to a booking
@[AC::MCP(card_only: true)]
@[AC::Route::POST("/:id/check_in")]
def check_in(id : String) : Booking
```

They're still ordinary routes, protected by your filters.

## Things to know

- **Root by default:** hosts only render cards for, and let cards call, the tools in
  their tool list, and some clients don't refresh their tools when a toolbox opens. So
  tools with `ui:` or `card_only: true` are root items, always listed, unless you annotate
  them `root: false`.
- **Caching:** hosts cache cards by URI, so tools advertise
  `ui://bookings/card.html?v=<content hash>`. Deploying a changed card changes its URI.
- **Safety:** `ui:` paths must be relative `.html` paths (checked at compile time), and
  nothing outside `ui_base` is served.
- **Deploying:** copy the cards folder into your image, like `www/`.

## See also

- [MCP overview](README.md)
- [Controller endpoints](endpoints.md)
- [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
