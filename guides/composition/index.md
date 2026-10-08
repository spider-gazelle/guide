# Composable applications

Action Controller **9.0.0** lets a Spider-Gazelle application reuse another app's controllers, serve several apps from one process, and mount an app at a new public path. The same composition describes HTTP routes, OpenAPI operations and MCP tools. Existing apps can keep their template startup and automatic controller discovery.

An application boundary is a controller base class, often an abstract `App::Base`. Selecting that base selects its concrete descendants and their routes. Each app can keep its own inherited filters, responders and exception handlers.

## Choose how to combine apps

For a combined API with one OpenAPI document and one global MCP server, start with `AC::Server.compose`. Add mounts when you need to change public paths. Use a handler chain when ordered fallback between independent routers is part of the design.

| Option                                       | Useful for                                                                             | Upsides                                                               | Tradeoffs                                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Automatic discovery                          | An existing single app                                                                 | Existing startup and catalog calls keep working                       | Requiring a controller library can expose more routes than intended; application roots are implicit              |
| `AC::Server.compose(...)`                    | One combined server using the template                                                 | Explicit roots, one routing table, unified OpenAPI/MCP and CLI output | Declared once per compiled application; conflicting public operations must be resolved                           |
| `AC::Composition.new(...)`                   | Several server instances or different catalogs in one binary                           | Each instance selects its own roots and public placements             | Pass the composition to servers, generators and tests; it does not configure the template's default CLI output   |
| `App::Base.handler` in an HTTP handler chain | Ordered fallback, overlapping local routes, or integration with other Crystal handlers | Each app matches independently; the first match wins                  | Each miss tries another router; a raw chain does not automatically produce a shared catalog or global MCP server |

**Mounting is available within these compositions.** A mount changes where a controller subtree is exposed. It gives reusable apps stable internal definitions and host-chosen public URLs, but callers must use mount-aware URL helpers and the host must coordinate middleware and global configuration.

## Reuse controllers as a library

A reusable app should expose a library entry point that requires its controller base, controllers and supporting models. For example, a shard might provide `require "other_app/controllers"`, defining `OtherAC::App::Base` and its descendants.

Keep executable startup and global configuration in the standalone app's entry point. The host requires the controller library and decides which server to create, which middleware to install, and how to configure sessions and MCP. Requiring a library should not also start a server or replace those settings.

You can continue to run the reusable app standalone with its existing template. Compilation includes the controllers; each composition selects the subtree it serves at initialization.

## One combined server

In the host's `src/config.cr`, require both apps' controllers, then declare their roots:

```
require "action-controller"
require "./controllers/application"
require "./controllers/*"
require "other_app/controllers" # your reusable shard's entry point
require "action-controller/server"
require "action-controller/mcp"

AC::Server.compose(App::Base, OtherAC::App::Base)
```

`compose` is a compile-time declaration. Declare it once, after requiring the controller definitions. It selects the default composition used by `AC::Server`, OpenAPI, MCP and the spec helper. The server registers all selected placements in one routing table; it does not try a separate app router for each request.

The template's existing server startup can stay as it is:

```
server = AC::Server.new(port, host)
AC::MCPServer.mount(server, "/mcp")
server.run
```

Its command line options also use the selected roots:

```
./bin/app --routes
./bin/app --docs --file=openapi.yml
./bin/app --mcp=mcp.yml
```

Although the template parses these options before `config.cr` is initialized, the compiler has already processed the `compose` declaration. Catalog generation can therefore exit before database connections or other configuration side effects.

If you omit `compose`, existing automatic discovery continues. Controllers used only as mount targets are excluded from standalone automatic discovery, so their original routes are not also exposed accidentally. Explicitly selecting an app includes its subtree independently of mounts declared by unrelated apps.

## Mount at a new base path

Suppose a reusable library defines this controller:

```
module OtherAC
  module App
    abstract class Base < AC::Base
      base "/oauth2"
    end

    class OAuth2 < Base
      base "/oauth2"

      @[AC::Route::GET("/login")]
      def login : String
        "Sign in"
      end

      @[AC::Route::POST("/token")]
      def token : String
        "Issue a token"
      end
    end
  end
end
```

The host chooses its public location:

```
class MyApp < AC::Base
  base "/myapp/"
  mount "/auth/", OtherAC::App::OAuth2
end

AC::Server.compose(MyApp)
```

The mount **replaces** the target's base. The routes become `GET /myapp/auth/login` and `POST /myapp/auth/token`; the `/oauth2` base is removed. Slashes are normalized. The mount declaration belongs to the host controller and its path is relative to that controller's public base.

A target can be a concrete controller or an abstract application base. Mounting an app includes its descendants, preserving their paths relative to the app's base:

| Original definition                | Mounted at `/service` |
| ---------------------------------- | --------------------- |
| App base `/api`                    | `/service`            |
| Descendant controller `/api/users` | `/service/users`      |
| Descendant controller `/health`    | `/service/health`     |

A descendant outside the app's base retains its entire path below the mount. `base` still sets each controller's own path; it does not implicitly prefix descendant controller bases.

Mounts can be nested and repeated:

```
class Gateway < AC::Base
  base "/gateway"
  mount "/primary", MyApp
  mount "/secondary", MyApp
end
```

Selecting `Gateway` exposes the login action at both `/gateway/primary/auth/login` and `/gateway/secondary/auth/login`. Each placement has its own public path, while the controller definition remains reusable.

Targets can be named relative to the declaring controller's namespace and can be declared later in the source. Mount cycles, conflicting public operations and ambiguous path parameter names are rejected. Conflict checks include equivalent parameterized paths and GET's generated HEAD operation. Mounting is not a way to choose an order between conflicting routes; use distinct bases or a handler chain when ordered fallback is required.

### Filters and request paths

Mounted actions run the target controller's own filters, responders and exception handlers, including those inherited from its controller base. The mounting controller's filters apply to its own actions. Mounting another subtree does not make its controllers inherit the host's filters.

Put cross-app policy in shared middleware or a controller base that the apps actually inherit. The host owns global logging, compression, sessions, MCP authentication/configuration and UI asset locations. See [filters](https://spider-gazelle.net/guides/filters/index.md) and [configuration](https://spider-gazelle.net/getting_started/configuration/index.md).

Requests keep their public `request.path`; mounting does not strip a prefix or rewrite the request. The controller sees its public base through the instance `base_route`. Explicit compositions and mounted apps isolate matched routes from path bindings left by upstream handlers. A miss preserves the context for the next handler. Ordinary automatic routing retains its existing binding behavior.

### Parameterized mounts

A mount can add parameters that actions or filters previously received from the query string:

```
class Reports < AC::Base
  base "/reports"

  @[AC::Route::GET("/summary")]
  def summary(account_id : Int64) : String
    "Report for account #{account_id}"
  end
end

class Accounts < AC::Base
  base "/accounts"
  mount "/:account_id/reports", Reports
end
```

Selecting `Accounts` exposes `GET /accounts/42/reports/summary`. The bound `account_id` is converted to `Int64` for the action, and OpenAPI and MCP describe the public parameter.

Required parameters in a target's original path must remain required parameters in the replacement path, with the same names. A mount cannot remove a required parameter or make it optional. If a replaced base contained optional parameters, declared action arguments can fall back to query parameters.

Optional mount segments (`?:name`) preserve the action's argument requirements: an argument required by the action remains required when the segment is omitted, so the caller must provide it through its query form. At a parameterized MCP controller endpoint, only arguments bound by the current session URL are removed from that session's tool schema. Other arguments remain available, and bound URL values take precedence when tools or prompts are invoked.

## Generate URLs for a placement

Inside an action, use `route_path` to build a URL with the current mounted base and bound path parameters:

```
route_path(:login) # inside the mounted OAuth2 controller
# => "/myapp/auth/login"
```

You can use that result with `redirect_to`. Explicit helper arguments override bound values, for example `route_path(:summary, account_id: 7)`. Individual path segments are encoded; optional and glob segments are supported. Later optional segments require values for earlier optional segments.

Existing class helpers such as `OtherAC::App::OAuth2.login` still produce the original `/oauth2/login` URL. Outside a request, use a composition to choose the public placement:

```
composition = AC::Composition.new([MyApp.name])
composition.url_for(OtherAC::App::OAuth2, :login)
# => "/myapp/auth/login"

gateway = AC::Composition.new([Gateway.name])
gateway.url_for(
  OtherAC::App::OAuth2, :login,
  mount_base: "/gateway/secondary/auth",
)
# => "/gateway/secondary/auth/login"
```

If a controller has several placements, `url_for` requires `mount_base:` to select one. For parameterized mounts, `mount_base:` is the placement's path pattern; pass the concrete parameter values as helper arguments.

## Independent compositions and unified catalogs

Create composition instances when different servers or generated catalogs need different selections. Roots are class **names** here; `Server.compose` takes class constants.

```
# After requiring the controller libraries
require "action-controller/server"
require "action-controller/mcp"

composition = AC::Composition.new([MyApp.name, AnotherApp::Base.name])
server = AC::Server.new(composition: composition)
AC::MCPServer.mount(server, "/mcp")

docs = AC::OpenAPI.generate_open_api_docs(
  title: "Combined API", version: "1.0.0", composition: composition,
)
File.write("openapi.yml", docs.to_yaml)
AC::MCPServer.write_description("mcp.yml", composition: composition)
```

The server's global MCP endpoint infers its composition from the server. OpenAPI and description generation receive the same instance explicitly. Different compositions can expose apps with identical original URLs on separate servers, because each has its own routing table and catalog selection.

OpenAPI uses the public mounted paths and distinct operation IDs. MCP tools, prompts, instructions and annotated controller endpoints use those same placements. Repeated mounts receive separate toolboxes and unique tool/prompt names. Existing MCP visibility annotations still apply. See [OpenAPI generation](https://spider-gazelle.net/openapi/generating/index.md), [MCP setup](https://spider-gazelle.net/mcp/setup/index.md) and [controller endpoints](https://spider-gazelle.net/mcp/endpoints/index.md).

Generate catalog files where source comments and the Crystal compiler are available, as described in those guides. Regenerate `mcp.yml` when selections or mounts change. Its composition identity detects stale files; a mismatch falls back to descriptions from compiled metadata, which do not retain source comments. Legacy files remain supported for ordinary apps without explicit composition or mounts. Description caches are scoped to the composition and description file.

Instance selections do not configure the template's default `--routes`, `--docs` and `--mcp` options. Use `Server.compose` for those defaults, or add generation code that passes your chosen instance explicitly.

### Test the same composition

```
require "action-controller/spec_helper"

composition = AC::Composition.new([MyApp.name])
client = AC::SpecHelper.new(composition).hot_topic
response = client.get("/myapp/auth/login")
```

For direct controller tests, `spec_instance` accepts `composition:` too. It binds the requested placement's base and path parameters without executing actions or filters. Existing test calls use the configured default composition. See [testing](https://spider-gazelle.net/guides/testing/index.md).

## Ordered HTTP handler chains

Each controller class provides `.handler`, returning a fresh `HTTP::Handler` for that class and its concrete descendants. This also works on an abstract app base:

```
require "action-controller"
# Require both apps' controller libraries here

server = HTTP::Server.new([
  App::Base.handler,
  OtherAC::App::Base.handler,
  HTTP::StaticFileHandler.new("www", directory_listing: false),
])
server.bind_tcp("127.0.0.1", 3000)
server.listen
```

Handlers are tried in order. A route miss calls the next handler, which can be another app, a static file handler or any Crystal HTTP handler. A matched action keeps its response, including an intentional 404 or an authentication failure. Response status does not turn a match into a miss. An app's controller filters run only after one of its routes matches.

Overlapping paths across different handlers are allowed: the first matching app owns that request. Use fresh handlers for each chain or server because a handler has a mutable `next` link. Request controller instances continue to be constructed with an `HTTP::Server::Context`.

A raw `HTTP::Server` chain has no combined composition for catalog generation. Its handler order and overlapping routes cannot be represented as distinct operations at the same public method/path in one OpenAPI document. If unified OpenAPI and a global MCP server are required, choose nonconflicting public paths and use one composition for the server and catalogs. You can also put ordinary middleware before that server's routing table and a fallback handler after it with `AC::Server.before` and `AC::Server.after`.

## Performance and operational tradeoffs

Root selection, mount expansion, validation and catalog projection happen at compilation or initialization. A unified composition flattens the public routes into one router. A mounted request uses that router and binds its public base in the context; it does not walk mount declarations or allocate a placement per request. Handler chains pay another lookup for every app that misses.

The 9.0.0 router uses an allocation-free exact static lookup and lazy trie matching for unescaped dynamic paths. Only successful captures become strings; escaped paths retain LuckyRouter's decoder. Dispatch remains through `Proc`, which won the measured mixed-target comparisons against callable objects and generated integer dispatch.

Local release benchmarks found no consistent warmed single-handler or mounted-app dispatch regression in the tested fixtures. Ordinary dynamic requests allocated 32–64 fewer bytes, and nested full-request dispatch improved about 1.6–2.8%. These measurements exclude startup and network I/O and do not guarantee zero overhead for every workload. Parameterized mounts, mounted URL generation, concurrent MCP requests and real network traffic need their own measurements. See the [benchmark fixtures and results](https://github.com/spider-gazelle/action-controller/blob/v9.0.0/benchmarks/README.md).

All apps in one process share dependencies and global settings. Compositions select routes; they do not isolate mutable globals, databases, sessions or MCP configuration. If apps need separate process-wide settings or independent deployment, run them in separate processes and route traffic at a proxy.

## See also

- [Controllers and routing](https://spider-gazelle.net/guides/routing/index.md)
- [Configuration](https://spider-gazelle.net/getting_started/configuration/index.md)
- [Filters](https://spider-gazelle.net/guides/filters/index.md)
- [OpenAPI generation](https://spider-gazelle.net/openapi/generating/index.md)
- [MCP setup](https://spider-gazelle.net/mcp/setup/index.md)
- [Testing](https://spider-gazelle.net/guides/testing/index.md)
