# UI cards

Tools can render an interactive card in the conversation instead of just text. Cards use the official [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) extension, supported by Claude, ChatGPT, VS Code, Microsoft 365 Copilot and others. Clients without it show the tool's text result as usual.

A card is a static HTML file. Point a route at it with `ui:`:

```
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

```
ActionController::MCPServer.ui_base = "./cards" # cards/bookings/card.html
```

The template keeps its cards in `cards/`, next to `www/`. Set `SG_MCP_UI` to change it.

## How it works

1. The tool's definition points at the card, `ui://bookings/card.html`.
1. When the tool is called, the host reads the card with `resources/read` and renders it in a sandboxed iframe.
1. The host sends the card the tool's arguments, then its result. The result is the [`{status, headers, body}` envelope](https://spider-gazelle.net/mcp/configuration/#tool-results), as `structuredContent`.

Cards can also call tools through the host, for example to refresh their data or act on a button press.

## Writing a card

Cards are self-contained HTML5 documents that talk to the host with JSON-RPC over `postMessage`. You can use the `@modelcontextprotocol/ext-apps` SDK, or the protocol directly:

```
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

The template's `cards/welcome/result.html` is a complete example: it follows the host's theme and reports its size so the host can fit the frame to it.

- **Theme:** the `ui/initialize` result includes `hostContext.theme` (`light` or `dark`) and CSS variables such as `--color-text-primary` in `hostContext.styles.variables`.
- **Size:** send `ui/notifications/size-changed` with the content height.
- **Calling tools:** send a `tools/call` request, for example to refresh the card's data.

## Card settings

By default hosts run cards with a strict content security policy: inline scripts and styles only, no external resources and no network requests. Declare anything a card needs with `ui_meta`, the default for every card:

```
ActionController::MCPServer.ui_meta = ActionController::MCPServer::UIMeta.new(
  prefers_border: true,
  csp: ActionController::MCPServer::UICSP.new(resource_domains: ["https://cdn.example.com"]),
)
```

or for a single card, with a `.meta.json` file next to it, which replaces the default:

```
// cards/bookings/card.meta.json
{"csp": {"connectDomains": ["https://api.example.com"]}, "prefersBorder": false}
```

| Setting               | Purpose                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| `csp.connectDomains`  | origins the card can `fetch` from                                               |
| `csp.resourceDomains` | origins for scripts, styles, images, fonts and media                            |
| `csp.frameDomains`    | origins the card can embed                                                      |
| `csp.baseUriDomains`  | allowed base URIs                                                               |
| `permissions`         | browser permissions to request, e.g. `{"clipboardWrite": {}}`. Hosts may refuse |
| `domain`              | a dedicated sandbox origin, host specific                                       |
| `prefersBorder`       | whether the host draws a border around the card                                 |

## Tools only cards call

Mark tools a card uses, but the model shouldn't, with `visibility: :card`. Hosts hide them from the model:

```
# Checks in to a booking
@[AC::MCP(visibility: :card)]
@[AC::Route::POST("/:id/check_in")]
def check_in(id : String) : Booking
```

They're still ordinary routes, protected by your filters. The opposite, `visibility: :model`, stops cards calling a tool. Hosts enforce visibility, and the `call_tool` and `call_read_only` proxies refuse card only tools, but it isn't access control: a client can still call a tool by name. In the tool definition, `:card` is sent as the spec's `"app"` (`_meta.ui.visibility: ["app"]`).

Card metadata is sent to every client. Hosts that support cards don't always advertise it, and hosts that don't support them ignore it and show the text result.

## Previewing cards

The card previewer renders your cards in a browser, without connecting an AI client. It plays the host's part: it calls the tool, loads the card and passes it the tool's arguments and result. You can try a card at different screen sizes and themes, and it checks the same rules a real host does.

Mount it after the MCP server, in development only:

```
server = ActionController::Server.new(port, host)
ActionController::MCPServer.mount(server, "/mcp")

server.run do
  # left out of release builds
  {% unless flag?(:release) %}
    server.mount_mcp_card_previewer("/mcp/card/preview")
  {% end %}
  puts "Listening on #{server.print_addresses}"
end
```

Then open <http://127.0.0.1:3000/mcp/card/preview>.

- **The index** lists each card with the tools that render it, and the tools only cards call (`visibility: :card`). It warns you when `ui_base` isn't set or a card file is missing.
- **A tool's page** has a form for the tool's arguments, built from its input schema. The card renders as soon as every required argument has a value, so a tool whose arguments are all optional renders straight away.
- **The toolbar** switches between desktop (1280px), tablet (768px) and mobile (375px) viewports, and light and dark themes. The card is told about each change, as a host would tell it.
- **The panels** below the card show every message between the card and the host, the raw tool result, and anything the card sends to the model (`ui/message` and `ui/update-model-context`).

Note

The previewer was added in action-controller 9.1.3. It finds the MCP server from `MCPServer.mount`, so mount that first. If a proxy serves your app under a prefix, pass the path the browser uses: `mount_mcp_card_previewer(mcp: "/prefix/mcp")`.

### Authentication

The previewer is an ordinary MCP client of your server, so requests go through your [authentication](https://spider-gazelle.net/mcp/authentication/index.md) and route filters. Add request headers, such as `Authorization`, in the page's header editor. They're sent with every MCP request and kept until you close the browser tab. Your site's cookies are sent automatically.

### Preview links

Everything on a tool's page can be set in the URL, so you can share a preview or script one:

```
/mcp/card/preview/tools/bookings_show?id=42&viewport_size=mobile&theme=dark
```

| Query param     | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `<argument>`    | a tool argument by name, e.g. `id=42`. Write objects and arrays as JSON |
| `viewport_size` | `desktop`, `tablet` or `mobile`                                         |
| `theme`         | `light` or `dark`                                                       |
| `header.<Name>` | a request header, e.g. `header.Authorization=Bearer%20token`            |

Tokens in URLs end up in server logs and browser history, so only put test credentials in `header.` params.

### What it checks

The previewer applies the rules hosts apply to cards, so problems show up before you deploy:

- **Content security policy:** the card runs in a sandboxed iframe with the policy built from its [card settings](#card-settings). A request to a domain the card hasn't declared is blocked.
- **Tool calls:** a card can only call the tools in the tool list, and not `visibility: :model` tools. Calls are sent with the same headers as the page.
- **Host messages:** the previewer answers `ui/initialize` with the theme, CSS variables, viewport and platform, resizes the card on `ui/notifications/size-changed`, and supports fullscreen, opening links and downloads. Anything it doesn't support is logged and answered with an error.

It isn't a full host. There's no model, and the card's frame has no origin of its own, so a card that uses `localStorage` fails in the previewer even though some hosts allow it.

Warning

Don't mount the previewer in production. Its pages are served without authentication and list your card tools and their descriptions. Tool calls still need valid credentials. The pages and their scripts are only compiled into your app when `mount_mcp_card_previewer` is called, so the `flag?(:release)` check keeps them out of release builds.

## Testing cards in a browser

Because previews can be driven by URL, browser tests are short: open a preview link, wait for the card, then check what's in it. The examples use [Playwright](https://playwright.dev), but any browser automation tool works.

Set up Playwright alongside your app:

```
npm init -y
npm install --save-dev @playwright/test
npx playwright install chromium
```

Configure it to start your app (unless it's already running) and send your test credentials:

```
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "browser",
  use: {
    baseURL: "http://127.0.0.1:3000",
    // wide enough for the desktop viewport (1280px) beside the form
    viewport: { width: 1920, height: 1080 },
    // sent with every request, including the previewer's MCP requests
    extraHTTPHeaders: { Authorization: `Bearer ${process.env.TEST_TOKEN}` },
  },
  webServer: {
    // a development build, so the previewer is mounted
    command: "crystal run src/app.cr",
    url: "http://127.0.0.1:3000/mcp/card/preview",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000, // the first build can be slow
  },
});
```

Then write a test for each card:

```
// browser/bookings.spec.ts
import { test, expect } from "@playwright/test";

// a link to a tool's preview
const preview = (tool: string, params: Record<string, string>) =>
  `/mcp/card/preview/tools/${tool}?${new URLSearchParams(params)}`;

for (const viewport of ["desktop", "tablet", "mobile"]) {
  test(`booking card on ${viewport}`, async ({ page }) => {
    await page.goto(preview("bookings_show", { id: "42", viewport_size: viewport }));

    // ready once the card has initialized and received the tool result
    await expect(page.locator("#stage")).toHaveAttribute("data-state", "ready");

    const card = page.frameLocator("#card");
    await expect(card.locator("h1")).toHaveText("Booking 42");
    await expect(page.locator("#card")).toHaveScreenshot(`booking-${viewport}.png`);
  });
}

test("checks in from the card", async ({ page }) => {
  await page.goto(preview("bookings_show", { id: "42" }));
  await expect(page.locator("#stage")).toHaveAttribute("data-state", "ready");

  // the card calls the bookings_check_in tool through the previewer
  await page.frameLocator("#card").getByRole("button", { name: "Check in" }).click();
  await expect(page.frameLocator("#card").getByText("Checked in")).toBeVisible();
});
```

Run them with `npx playwright test`. On CI, install the browser with `npx playwright install --with-deps chromium` and set `TEST_TOKEN` as a secret.

`toHaveScreenshot` saves a reference image of the card the first time it runs, then fails if the card's appearance changes. The card always lays out at the viewport's full width, and the stage scrolls when the browser window is narrower, so keep the window wide enough for the desktop viewport. Update the images with `npx playwright test --update-snapshots`.

### What tests can check

| Selector or property          | Purpose                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `#stage[data-state]`          | `idle` (waiting for required arguments), `loading`, `rendering`, `ready` or `error` |
| `#stage[data-tool-error]`     | present when the tool returned an error, which the card still renders               |
| `#status`                     | a description of the state, such as why rendering failed                            |
| `#card`                       | the card's iframe, use `page.frameLocator("#card")` to look inside it               |
| `window.cardPreviewer.result` | the tool result sent to the card                                                    |
| `window.cardPreviewer.log`    | every message, as `{dir, summary, data, level}`                                     |

For example, to check a card didn't log any errors:

```
const log = await page.evaluate(() => (window as any).cardPreviewer.log);
expect(log.filter((entry) => entry.level === "error")).toEqual([]);
```

To test what happens without credentials, leave them out. When the MCP server requires [authentication](https://spider-gazelle.net/mcp/authentication/index.md), the state becomes `error` and `#status` reports the 401 Unauthorized response. When only the route checks credentials, the card renders the error response and `#stage` has `data-tool-error`.

## Things to know

- **Root by default:** hosts only render cards for the tools in their tool list, and toolbox tools aren't listed (the model runs them through the proxies). So tools with `ui:` are root items, always listed, unless you annotate them `root: false`. Tools with `visibility: :card` are always listed, so cards can call them, and hosts hide them from the model.
- **Caching:** hosts cache cards by URI, so tools advertise `ui://bookings/card.html?v=<content hash>`. Deploying a changed card changes its URI.
- **Safety:** `ui:` paths must be relative `.html` paths (checked at compile time), and nothing outside `ui_base` is served.
- **Deploying:** copy the cards folder into your image, like `www/`.

## See also

- [MCP overview](https://spider-gazelle.net/mcp/index.md)
- [Controller endpoints](https://spider-gazelle.net/mcp/endpoints/index.md)
- [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
