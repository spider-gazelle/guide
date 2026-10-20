# Active Model

ActiveModel provides a known set of interfaces for model classes, and is the foundation for building custom ORMs.

!!! note
    [pg-orm](../pg_orm/README.md) is built on top of ActiveModel — everything on this page (attributes, dirty tracking, validations, callbacks, serialisation) is available to a pg-orm model too.

## Installation

Add the shard to your `shard.yml`, then run `shards install`.

```yaml
dependencies:
  active-model:
    github: spider-gazelle/active-model
    version: ~> 4.7
```

## Defining a model

`ActiveModel::Model` is an abstract base class. Inherit from it and declare your fields with the `attribute` macro.

```crystal
require "active-model"

class Person < ActiveModel::Model
  attribute name : String = "default value"
  attribute age : Int32
end
```

Instances mix in `JSON::Serializable`, `YAML::Serializable` and `DB::Serializable`, so they serialise and deserialise out of the box.

## The `attribute` macro

`attribute` takes a typed field name and an optional default value.

```crystal
attribute name : String            # nil until assigned; the getter raises NilAssertionError while nil
attribute age : Int32 = 18         # with a default
```

Common options:

* `mass_assignment:` — allow the field to be set by mass assignment (`assign_attributes`, untrusted `from_json`/`from_yaml`, HTTP params) (default `true`)
* `persistence:` — when `false`, the field isn't serialised or persisted (default `true`)
* `show:` — serialise the field even when `persistence: false` (default `false`)
* `sanitize:` — strip/clean HTML on write (see [Serialisation](serialization.md))
* `serialization_group:` — add the field to a named serialiser (see [Serialisation](serialization.md))
* JSON/YAML tags — `json_key`, `json_emit_null`, `json_root`, `yaml_key`, … plus `converter:`

### Enums

Enum attributes are supported. By default an enum serialises as a snake_case string (`ExtraMedium` becomes `"extra_medium"`). Use [`Enum::ValueConverter(T)`](https://crystal-lang.org/api/latest/Enum/ValueConverter.html) to serialise the backing value instead. Give the converter the enum's fully qualified name, as it's expanded outside the class.

```crystal
class Order < ActiveModel::Model
  enum Product
    Fries
    Burger
  end

  enum Size
    Medium
    ExtraMedium
  end

  attribute product : Product = Product::Fries
  attribute size : Size = Size::ExtraMedium, converter: Enum::ValueConverter(Order::Size)
end

Order.new.to_json # => {"product":"fries","size":1}
```

## Constructing models

```crystal
person = Person.new(name: "Bob Jane", age: 32)
person.attributes # => {:name => "Bob Jane", :age => 32}

# from JSON / YAML
person = Person.from_json(%({"name": "Bob Jane"}))
person.name    # => "Bob Jane"
person.to_json # => {"name":"Bob Jane"}

# from HTTP::Params (also accepts Hash(String, String)) — mass-assignable fields only
person = Person.new(params)
```

!!! note
    `from_json` / `from_yaml` treat input as untrusted: fields with `mass_assignment: false` (and not `show: true`) are ignored and fall back to their default. Use `from_trusted_json` / `from_trusted_yaml` for internal sources. `assign_attributes` updates an existing instance in place (mass-assignable fields only), and `assign_attributes_from_json` / `assign_attributes_from_yaml` do the same from a payload. The `HTTP::Params` constructor only handles scalar fields: calling it on a model with an `Array` attribute doesn't compile.

Introspection helpers: `attributes` (Hash), `attributes_tuple` (NamedTuple), `Person.attributes` (Array of Symbol keys), and `persistent_attributes` (only fields without `persistence: false`).

## Dirty tracking

Changes are tracked over the lifetime of the model, similar to [ActiveModel::Dirty](http://api.rubyonrails.org/classes/ActiveModel/Dirty.html).

```crystal
person = Person.new(name: "JD")
person.changed?           # => true
person.changed_attributes # => {:name => "JD"}
person.name_changed?      # => true
person.name_change        # => {nil, "JD"}
person.name_was           # => nil

person.clear_changes_information
person.changed? # => false
```

Per-attribute you get `<attr>_changed?`, `<attr>_was`, `<attr>_change` (a `{old, new}` tuple), and `<attr>_will_change!` to force-mark a field. Across the model: `changed?`, `changed_attributes`, `changes` (a Hash of `{old, new}` tuples), `changed_json` / `changed_yaml`, `changes_json`, `restore_attributes` (revert to previous values), and `clear_changes_information` (reset tracking).

Models built with `from_json` / `from_yaml` start with no changes recorded.

## See also

* [Validations](validations.md)
* [Callbacks](callbacks.md)
* [Serialisation](serialization.md)
* [PgORM](../pg_orm/README.md)
