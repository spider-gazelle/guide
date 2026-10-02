# Schemas

Every type that appears in a route, whether a parameter, request body or response, is
described with [JSON Schema](https://json-schema.org/). The schemas are generated at
compile time by the [json-schema](https://github.com/spider-gazelle/json-schema) shard,
so they always match your actual types.

## Types you get for free

| Crystal type | Schema |
|---|---|
| `String` | `string` |
| `Int32`, `Int64`, `UInt8`, ... | `integer` with a `format` such as `Int64` |
| `Float32`, `Float64` | `number` |
| `Bool` | `boolean` |
| `Time` | `string`, `format: date-time` |
| `UUID` | `string`, `format: uuid` |
| `Enum` | `string` with an `enum` list of the member names (snake case) |
| `Array(T)`, `Set(T)`, `Tuple` | `array` |
| `Hash(String, T)` | `object` with `additionalProperties` |
| `NamedTuple`, `JSON::Serializable` | `object` with `properties` and `required` |
| `A | B` | `anyOf`. A nilable `T?` is marked `nullable` |

## Your models

Include `JSON::Serializable` and the schema follows your class. Required properties are
those that aren't nilable and have no default, matching how `from_json` behaves.

```crystal
# A comment left on an article
class Comment
  include JSON::Serializable

  getter id : Int64
  getter author : String

  @[JSON::Field(description: "markdown formatted")]
  getter body : String

  @[JSON::Field(key: "created_at")]
  getter created : Time

  @[JSON::Field(ignore: true)]
  getter cache_key : String = ""
end
```

- The **class doc comment** becomes the schema's description.
- `key:` renames properties, and `ignore: true` leaves them out, exactly as the JSON
  serialiser does.
- `description:` documents an individual property.

## Refining a property

`@[JSON::Field]` accepts JSON Schema keywords that tighten validation hints in the
document:

```crystal
class Signup
  include JSON::Serializable

  @[JSON::Field(format: "email")]
  getter email : String

  @[JSON::Field(min_length: 8, max_length: 64)]
  getter password : String

  @[JSON::Field(pattern: "^[a-z0-9_]+$")]
  getter username : String

  @[JSON::Field(minimum: 13, maximum: 130)]
  getter age : Int32

  # stored as a Time, but the JSON value is a unix timestamp
  @[JSON::Field(converter: Time::EpochConverter, type: "integer", format: "Int64")]
  getter joined : Time
end
```

The supported keys are `type`, `format`, `pattern`, `min_length`, `max_length`,
`multiple_of`, `minimum`, `exclusive_minimum`, `maximum`, `exclusive_maximum` and
`description`.

!!! note
    These are documentation hints. They don't add runtime validation. Validate in
    your model or with a library such as
    [active-model](https://github.com/spider-gazelle/active-model).

When you use a `converter:`, override `type` and `format` so the schema describes the
JSON value rather than the Crystal type.

## Custom types

If a type serialises itself some other way, describe it by implementing
`self.json_schema`. Return a `NamedTuple` (or anything with `to_json`) in JSON Schema
form:

```crystal
struct Money
  def self.json_schema(openapi : Bool? = nil)
    {type: "string", pattern: "^\\d+\\.\\d{2}$", description: "an amount, e.g. 12.50"}
  end

  def to_json(json : JSON::Builder)
    json.string(to_s)
  end
end
```

## How schemas appear in the document

Request and response types are listed once under `components/schemas` and referenced
with `$ref`, so shared models are described in one place. Parameter schemas are inlined.

In [MCP tools](../mcp/README.md), each tool's input schema is self-contained: the
referenced schemas are included as `$defs`, and nullable types are expressed in standard
JSON Schema.

## See also

- [Describing routes](descriptions.md)
- [json-schema shard](https://github.com/spider-gazelle/json-schema)
