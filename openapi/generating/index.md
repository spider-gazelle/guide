# Generating and serving

This page covers producing the OpenAPI document from your app, at build time or from the command line, and then serving it, committing it and generating clients from it.

## How generation works

Most of the document is built at compile time from your annotations and types. Doc comments aren't available to compiled code, so they're extracted by running `crystal docs` over your source when the document is generated.

Generate where the source code is

Generation needs the `crystal` compiler, your `src/` directory and `shard.yml` (for `crystal docs`). Generate the document at build time, or during development. A deployed binary without its source can't generate it.

## From the command line

The [application template](https://github.com/spider-gazelle/spider-gazelle) adds a `--docs` flag:

```
crystal build src/app.cr -o app

./app --docs                     # print the YAML document
./app --docs --file=openapi.yml  # save it to a file
```

Behind the flag is a single call that you can use in any app:

```
require "action-controller"
require "action-controller/server"

docs = ActionController::OpenAPI.generate_open_api_docs(
  title: "My API",
  version: "1.0.0",
  description: "Everything you need to manage widgets",
)

File.write("openapi.yml", docs.to_yaml)
```

`title` and `version` are required. Any other [info object](https://spec.openapis.org/oas/v3.0.3#info-object) fields, such as `description`, `termsOfService` or `contact`, can be passed as named arguments. The result is a `NamedTuple`, so `.to_json` works too.

## In Docker builds

The template's Dockerfile generates the document in the build stage, where the source is available, and copies it into the final image:

```
# Generate OpenAPI docs and MCP tool descriptions while we still have source code access
RUN ./bin/app --docs --file=openapi.yml && \
    ./bin/app --mcp=mcp.yml

# ...

COPY --from=build /app/openapi.yml /openapi.yml
```

## Serving the document

Load the generated file at startup and return it from a route:

```
class Docs < AC::Base
  base "/"

  # generated during the docker build
  OPENAPI = YAML.parse(File.exists?("openapi.yml") ? File.read("openapi.yml") : "{}")

  # returns the OpenAPI representation of this service
  @[AC::MCP(hide: true)]
  @[AC::Route::GET("/openapi")]
  def openapi : YAML::Any
    OPENAPI
  end
end
```

`@[AC::MCP(hide: true)]` keeps the document out of your [MCP tools](https://spider-gazelle.net/mcp/index.md): it's for people and code generators, not models.

Point [Swagger UI](https://editor.swagger.io/), [Redoc](https://redocly.github.io/redoc/) or [Scalar](https://scalar.com/) at `/openapi` to browse it.

## Committing the document

Many projects also commit the generated file (e.g. `OPENAPI_DOC.yml`). Reviewers can then see API changes in pull requests, and clients can be generated from the repository. Regenerate it whenever routes change:

```
crystal build src/app.cr -o app && ./app --docs > OPENAPI_DOC.yml && rm app
```

## Generating clients

Any OpenAPI tool can consume the document. For example, a TypeScript client with [OpenAPI Generator](https://openapi-generator.tech/):

```
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yml -g typescript-fetch -o ./client
```

Because the document is generated from the server code, regenerating the client after an API change gives you compile errors exactly where your frontend needs updating.

## Troubleshooting

| Symptom                                                  | Cause                                                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `failed to obtain route descriptions via 'crystal docs'` | generation ran without the source code, `crystal`, or `shard.yml` in the working directory                                 |
| A route is missing                                       | it was defined with the macro DSL (`get "/" do`), so use an annotation, or it's an `OPTIONS` route, which isn't documented |
| No response schema                                       | the method has no return type                                                                                              |
| A summary contains notes meant for developers            | separate those notes from the doc comment with a blank line                                                                |

## See also

- [Describing routes](https://spider-gazelle.net/openapi/descriptions/index.md)
- [MCP setup](https://spider-gazelle.net/mcp/setup/index.md), which uses the same build step for `mcp.yml`
- [Deployment](https://spider-gazelle.net/deployment/index.md)
