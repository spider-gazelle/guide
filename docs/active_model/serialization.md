A model serializes to JSON and YAML through `to_json` / `to_yaml` by default. On top of that, ActiveModel can generate **partial** serializers scoped to named groups, and can **sanitize** string content on write.

## Serialization groups

Tag an attribute with `serialization_group:` (a `Symbol` or `Array(Symbol)`). Each named group generates a `to_<group>_json` method that emits only the attributes in that group.

```crystal
class SerializationGroups < ActiveModel::Model
  attribute everywhere : String = "hi", serialization_group: [:admin, :user, :public]
  attribute joined : Int64 = 0, serialization_group: [:admin, :user]
  attribute mates : Int64 = 0, serialization_group: :user
  attribute another : String = "ok"
end

m = SerializationGroups.new
m.to_public_json # => {"everywhere":"hi"}
m.to_admin_json  # => {"everywhere":"hi","joined":0}
m.to_user_json   # => {"everywhere":"hi","joined":0,"mates":0}
```

A matching `to_<group>_struct` is also generated for each group.

### `define_to_json`

Define a subset serializer without tagging each attribute. Select fields with `only:` or `except:`, and pull in instance methods with `methods:`.

```crystal
class SerializationGroups < ActiveModel::Model
  attribute joined : Int64 = 0
  attribute another : String = "ok"
  attribute everywhere : String = "hi"

  define_to_json :some, only: [:joined, :another]
  define_to_json :most, except: :everywhere
  define_to_json :method, only: :joined, methods: :foo

  getter foo = "foo"
end

m.to_some_json   # => {"joined":0,"another":"ok"}
m.to_most_json   # => {"joined":0,"another":"ok"}
m.to_method_json # => {"joined":0,"foo":"foo"}
```

`only`, `except` and `methods` each accept a `Symbol` or `Array(Symbol)`.

## Sanitization

Use the `sanitize:` option on `attribute` to strip or clean HTML from string fields, and from arbitrarily-nested containers of strings. It applies on **every write path** — constructors, setters, JSON/YAML deserialization, and HTTP params.

```crystal
class Article < ActiveModel::Model
  attribute title : String, sanitize: :text
  attribute body : String?, sanitize: :common
  attribute tags : Array(String), sanitize: :text
end

article = Article.new(title: "<b>Hello</b> World", tags: ["<b>one</b>", "<i>two</i>"])
article.title # => "Hello World"
article.tags  # => ["one", "two"]

article.body = "<p>Safe</p><script>alert('xss')</script>"
article.body # => "<p>Safe</p>"
```

### Policies

| Policy | Behaviour |
|--------|-----------|
| `:text` | Strips **all** HTML tags, returning plain text |
| `:basic` | Allows basic formatting (`<b>`, `<i>`, etc.) |
| `:inline` | Allows inline elements, strips block-level elements |
| `:common` | Allows common safe HTML (`<p>`, `<b>`, `<i>`, etc.) |

### Supported types

`String`, `JSON::Any` (string leaves only), `Array(T)`, `Set(T)`, `Hash(K, V)` (values only), and unions with at least one sanitizable arm — each also valid as a nilable `?`. Element types may nest, so `Array(Hash(String, Array(String)))` works.

!!! warning
    `sanitize:` is only valid for types with a sanitizable leaf. Using it on e.g. `Int32` or `Array(Int32)` is a **compile-time error**.

!!! note
    For your own classes or rare stdlib types, include `ActiveModel::Sanitizable` and implement `sanitize(policy : Symbol) : self`. The macro accepts any type that includes the module, and the runtime delegates to it. `JSON::Any` is also a universal fallback for unusual payloads.
