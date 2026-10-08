# Setting up MCP

The [application template](https://github.com/spider-gazelle/spider-gazelle) has MCP set up already: run the app and connect a client to `http://localhost:3000/mcp`. This page explains each piece, so you can add MCP to an existing app or customise the template.

## 1. Require and configure

MCP is an optional part of action-controller. Require it after your controllers, and configure it in `src/config.cr`:

```
require "action-controller"
require "./controllers/*"
require "action-controller/server"
require "action-controller/mcp"

ActionController::MCPServer.tap do |mcp|
  mcp.server_name = "my-app"
  mcp.server_version = "1.0.0"
  mcp.description_path = ENV["SG_MCP_DESCRIPTION"]? || "mcp.yml"
end
```

## 2. Mount the endpoint

Mount the server on your `ActionController::Server` when it's created (in the template, `src/app.cr`):

```
server = ActionController::Server.new(port, host)
ActionController::MCPServer.mount(server, "/mcp")
server.run
```

`mount` registers `POST`, `GET` and `DELETE` handlers at the path for the [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http) transport, the OAuth protected resource metadata at `/.well-known/oauth-protected-resource<path>`, and any [controller endpoints](https://spider-gazelle.net/mcp/endpoints/index.md) (`endpoints: false` skips them). In the template the path comes from `SG_MCP_PATH`; set it to an empty string to disable MCP.

## 3. Generate the tool descriptions

Tool and toolbox descriptions come from your doc comments. Like the [OpenAPI document](https://spider-gazelle.net/openapi/generating/index.md), these are extracted with `crystal docs`, so they're generated where the source is available and shipped with the binary as `mcp.yml`:

```
./app --mcp=mcp.yml
```

The template's flag calls:

```
ActionController::MCPServer.write_description("mcp.yml")
```

The Dockerfile generates it during the build and copies it next to the binary:

```
RUN ./bin/app --docs --file=openapi.yml && \
    ./bin/app --mcp=mcp.yml

COPY --from=build /app/mcp.yml /mcp.yml
```

`mcp.yml` is loaded the first time a client connects. If it's missing, the server builds the tools from the compiled routes alone and logs a warning; everything works, but the model sees no descriptions.

Write descriptions for the model

The model chooses tools by their descriptions. A one-line summary of what a route does, plus `@[AC::Param::Info(description:)]` on non-obvious parameters, makes a big difference. These are the same comments that document your OpenAPI.

## 4. Connect a client

```
claude mcp add --transport http my-app http://localhost:3000/mcp

# with an API key
claude mcp add --transport http my-app http://localhost:3000/mcp \
  --header "X-API-Key: <key>"
```

```
{
  "mcpServers": {
    "my-app": {
      "type": "http",
      "url": "https://my-app.example.com/mcp"
    }
  }
}
```

`.vscode/mcp.json`:

```
{
  "servers": {
    "my-app": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is the best way to see exactly what your server exposes:

```
npx @modelcontextprotocol/inspector
```

Choose **Streamable HTTP** and enter `http://localhost:3000/mcp`.

## 5. Test it

The spec helper drives the MCP endpoint in-process like any other route:

```
require "./spec_helper"

describe "MCP" do
  router = AC::SpecHelper.new
  ActionController::MCPServer.mount(router, "/mcp")
  client = router.hot_topic

  headers = HTTP::Headers{"Content-Type" => "application/json", "Accept" => "application/json"}

  it "lists the toolboxes" do
    init = client.post("/mcp", headers: headers, body: {
      jsonrpc: "2.0", id: 1, method: "initialize", params: {protocolVersion: "2025-11-25"},
    }.to_json)
    headers["Mcp-Session-Id"] = init.headers["Mcp-Session-Id"]

    response = client.post("/mcp", headers: headers, body: {
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: {name: "list_toolboxes", arguments: {} of String => String},
    }.to_json)

    toolboxes = JSON.parse(response.body)["result"]["structuredContent"]["toolboxes"]
    toolboxes.as_a.map(&.["name"]).should contain "welcome"
  end
end
```

See the template's `spec/mcp_spec.cr` for tool calls and prompts.

## See also

- [Composable applications](https://spider-gazelle.net/guides/composition/index.md): a global MCP server for combined apps
- [Annotation options](https://spider-gazelle.net/mcp/prompts/index.md)
- [Authentication](https://spider-gazelle.net/mcp/authentication/index.md)
- [Configuration](https://spider-gazelle.net/mcp/configuration/index.md)
