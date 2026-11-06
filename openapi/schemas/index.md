# Schemas

Every type that appears in a route, whether a parameter, request body or response, is described with [JSON Schema](https://json-schema.org/). The schemas are generated at compile time by the [json-schema](https://github.com/spider-gazelle/json-schema) shard, so they always match your actual types.

## Types you get for free

| Crystal type                       | Schema                                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| `String`                           | `string`                                                      |
| `Int32`, `Int64`, `UInt8`, ...     | `integer` with a `format` such as `Int64`                     |
| `Float32`, `Float64`               | `number`                                                      |
| `Bool`                             | `boolean`                                                     |
| `Time`                             | `string`, `format: date-time`                                 |
| `UUID`                             | `string`, `format: uuid`                                      |
| `Enum`                             | `string` with an `enum` list of the member names (snake case) |
| `Array(T)`, `Set(T)`, `Tuple`      | `array`                                                       |
| `Hash(String, T)`                  | `object` with `additionalProperties`                          |
| `NamedTuple`, `JSON::Serializable` | `object` with `properties` and `required`                     |
| \`A                                | B\`                                                           |

Enums and `JSON::Serializable` types are defined once as named components and referenced wherever they're used. See [how schemas appear in the document](#how-schemas-appear-in-the-document).

## Your models

Include `JSON::Serializable` and the schema follows your class. Required properties are those that aren't nilable and have no default, matching how `from_json` behaves.

```
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
- `key:` renames properties, and `ignore: true` leaves them out, exactly as the JSON serialiser does.
- `description:` documents an individual property.

## Refining a property

`@[JSON::Field]` accepts JSON Schema keywords that tighten validation hints in the document:

```
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

The supported keys are `type`, `format`, `pattern`, `min_length`, `max_length`, `multiple_of`, `minimum`, `exclusive_minimum`, `maximum`, `exclusive_maximum` and `description`.

Note

These are documentation hints. They don't add runtime validation. Validate in your model or with a library such as [active-model](https://github.com/spider-gazelle/active-model).

When you use a `converter:`, override `type` and `format` so the schema describes the JSON value rather than the Crystal type.

## Custom types

If a type serialises itself some other way, describe it by implementing `self.json_schema`. Return a `NamedTuple` (or anything with `to_json`) in JSON Schema form:

```
struct Money
  def self.json_schema(openapi : Bool? = nil)
    {type: "string", pattern: "^\\d+\\.\\d{2}$", description: "an amount, e.g. 12.50"}
  end

  def to_json(json : JSON::Builder)
    json.string(to_s)
  end
end
```

A type like `Money` is inlined wherever it's used. If a `JSON::Serializable` type or an enum defines `self.json_schema`, it still gets its own component (see below), and that method provides the definition.

## How schemas appear in the document

Every `JSON::Serializable` type and enum is defined once under `components/schemas`. Everywhere it's used, it's referenced with `$ref`: in request bodies, responses, parameters, and nested inside other types. Each model is described in one place, so client generators produce one named type per model rather than an anonymous copy at every use.

```
module Shop
  # A line on an order
  struct Item
    include JSON::Serializable

    getter sku : String
    getter quantity : Int32
  end

  enum Status
    Pending
    Shipped
  end

  # An order placed in the shop
  class Order
    include JSON::Serializable

    getter items : Array(Item)
    getter status : Status
    getter replaces : Order?
  end

  struct Page(T)
    include JSON::Serializable

    getter results : Array(T)
    getter total : Int32
  end
end

class Orders < AC::Base
  base "/orders"

  @[AC::Route::GET("/")]
  def index(status : Shop::Status? = nil) : Shop::Page(Shop::Order)
    raise NotImplementedError.new("load the orders")
  end
end
```

The generated components:

```
components:
  schemas:
    Shop.Page-oShop.Order-c:
      type: object
      properties:
        results:
          type: array
          items:
            $ref: '#/components/schemas/Shop.Order'
        total:
          type: integer
          format: Int32
      required: [results, total]
    Shop.Order:
      type: object
      properties:
        items:
          type: array
          items:
            $ref: '#/components/schemas/Shop.Item'
        status:
          $ref: '#/components/schemas/Shop.Status'
        replaces:
          anyOf:
          - type: "null"
          - $ref: '#/components/schemas/Shop.Order'
      required: [items, status]
      description: An order placed in the shop
    Shop.Item:
      type: object
      properties:
        sku:
          type: string
        quantity:
          type: integer
          format: Int32
      required: [sku, quantity]
      description: A line on an order
    Shop.Status:
      type: string
      enum: [pending, shipped]
```

- **Nested types are referenced too.** `Shop::Item` only ever appears inside `Order`, and it's still a component of its own. The type's doc comment becomes its description.
- **Nilable references** such as `replaces : Order?` are an `anyOf` of the reference and `{type: "null"}`. The optional `status` parameter is described the same way.
- **Self-referencing types**, like `Order` above, work.
- **Enums are referenced by type.** Two enums with the same members stay separate components.
- **Everything else is inlined where it's used:** strings, numbers, arrays, hashes, unions and tuples, and custom types like `Money`.

### Component names

A component's name is derived from the type's full name. Only the characters OpenAPI allows are used, and the conversion is reversible, so two different types never share a name:

| Type                      | Component name            |
| ------------------------- | ------------------------- |
| `Item`                    | `Item`                    |
| `Shop::Item`              | `Shop.Item`               |
| `Shop::Page(Shop::Order)` | `Shop.Page-oShop.Order-c` |
| `Pair(A::B, C)`           | `Pair-oA.B-nC-c`          |
| `Pair(A, B::C)`           | `Pair-oA-nB.C-c`          |

`::` becomes `.`. In generic types, `(`, `)`, `,` and `|` become `-o`, `-c`, `-n` and `-p`. Any other character becomes `-u` followed by its six digit hex code.

### OpenAPI 3.0

The document is OpenAPI 3.1 by default, whose schemas are standard JSON Schema 2020-12. For tools that only read OpenAPI 3.0, ask for 3.0.3:

```
ActionController::OpenAPI.generate_open_api_docs(title: "Shop", version: "1.0", openapi: "3.0.3")
```

OpenAPI 3.0 has its own dialect of JSON Schema, so a few things are written differently:

|                                  | 3.1 (default)                                                 | 3.0.3                                                     |
| -------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| A nilable `T?`                   | `anyOf` with `{type: "null"}`                                 | `nullable: true`                                          |
| A nilable or described reference | `anyOf` with `{type: "null"}`, or `$ref` beside `description` | `allOf: [$ref]` with `type`, `nullable` and `description` |
| `Tuple(A, B)`                    | `prefixItems: [A, B]`                                         | `items: {anyOf: [A, B]}` with `minItems`/`maxItems`       |
| `exclusive_minimum: 5`           | `exclusiveMinimum: 5`                                         | `minimum: 5, exclusiveMinimum: true`                      |

### MCP tools

In [MCP tools](https://spider-gazelle.net/mcp/index.md), each tool's input schema is self-contained. The components it references, including nested ones, are included as `$defs`, and nullable types are expressed in standard JSON Schema.

## See also

- [Describing routes](https://spider-gazelle.net/openapi/descriptions/index.md)
- [json-schema shard](https://github.com/spider-gazelle/json-schema)
