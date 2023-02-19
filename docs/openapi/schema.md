## Optimal results

For optimal output it's recommended that you:

* decorate your route functions with return types (assumes no body if not decorated)
* decorate your models to improve [JSON schema](https://github.com/spider-gazelle/json-schema)

```crystal

class Comments < Application
  base "/comments"

  # description of your model that will be used in the OpenAPI output
  class Comment
    include JSON::Serializable

    # add format information to the output schema
    @[JSON::Field(format: "email")]
    property reply_to : String
    property user_id : Int64
    property text : String
  end

  # This is a route summary
  @[AC::Route::GET("/:comment_id")]
  def show(comment_id : Int64) : Comment
    Comment.find(comment_id)
  end
end

```


## Schema descriptions

[JSON schema](https://github.com/spider-gazelle/json-schema) is automatically extracted for all the types being serialised / deserialised including:

* Parameters (route and query)
* Request bodies
* Response bodies

For [JSON::Serializable](https://crystal-lang.org/api/latest/JSON/Serializable.html) types you can include additional information.

```crystal

class Comment
  include JSON::Serializable

  # add format information to the output schema
  @[JSON::Field(format: "email")]
  property reply_to : String
  property user_id : Int64

  @[JSON::Field(format: "email")]
  property text : String

  # The `EpochConverter` here means the JSON value will actually be an integer
  # to avoid the schema output being `type: "string", format: "date-time"` you can
  # supply a type override and custom format string.
  @[JSON::Field(converter: Time::EpochConverter, type: "integer", format: "Int64")]
  getter time : Time
end

```

Some of the `@[JSON::Field]` annotations you can use are:

* type
* format
* pattern
* min_length
* max_length
* multiple_of
* minimum
* exclusive_minimum
* maximum
* exclusive_maximum

as per the [JSON Schema](https://json-schema.org/) spec

### Custom types

If your model doesn't use `JSON::Serializable` and instead is using a custom serializer then you can implment `def self.json_schema(openapi : Bool? = nil)` to return a `NamedTuple` with the [JSON Schema](https://json-schema.org/) representation of your model.
