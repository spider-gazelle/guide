Spider-Gazelle has the ability to ouput OpenAPI descriptions of the routes defined in your service.

## Output

The source code is required to output OpenAPI as we extract descriptions from regular comments. The simplest way to generate the OpenAPI YAML is to call this :

```crystal
ActionController::OpenAPI.generate_open_api_docs(
    title: "Application",
    version: "0.0.1",
    description: "App description for OpenAPI docs"
  ).to_yaml
```

Like the OpenAPI specification, `title` and `version` fields are required. 
For the other fields, you can refer to the [Info OpenAPI Specification](https://spec.openapis.org/oas/v3.1.0#info-object)

## Usage with spider-gazelle template

1. build the application `shards build`
2. generate the OpenAPI output `./bin/app --docs`
   * If you would like a file then run `./bin/app --docs > ./bin/description.yml`

## Usage with `action-controller` project

You can then serve this document from your service when it's deployed if desirable.

```crystal

class OpenAPI < AC::Base
  base "/openapi"

  DOCS = ActionController::OpenAPI.generate_open_api_docs(
    title: "Application",
    version: "0.0.1",
    description: "App description for OpenAPI docs"
  ).to_yaml

  get "/docs" do
    render yaml: DOCS
  end  
end

```

then visit your documentation at "http://localhost:3000/openapi/docs"
