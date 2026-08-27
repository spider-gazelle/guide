ActiveModel provides a known set of interfaces for model classes, and is the foundation for building custom ORMs.

!!! note
    [pg-orm](../pg_orm/README.md) is built on top of ActiveModel — everything on this page (attributes, dirty tracking, validations, callbacks, serialization) is available to a pg-orm model too.

`ActiveModel::Model` is an abstract base class. Inherit from it and declare your fields with the `attribute` macro.

```crystal
require "active-model"

class Person < ActiveModel::Model
  attribute name : String = "default value"
  attribute age : Int32
end
```

Instances mix in `JSON::Serializable`, `YAML::Serializable` and `DB::Serializable`, so they serialize and deserialize out of the box.

## The `attribute` macro

`attribute` takes a typed field name and an optional default value.

```crystal
attribute name : String            # nilable until assigned
attribute age : Int32 = 18         # with a default
```

Common options:

* `mass_assignment` — include the field in mass assignment (default `true`)
* `persistence` — emit the key when serializing (default `true`)
* `sanitize:` — strip/clean HTML on write (see [Serialization](serialization.md))
* `serialization_group:` — add the field to a named serializer (see [Serialization](serialization.md))
* JSON/YAML tags — `json_key`, `json_emit_null`, `json_root`, `yaml_key`, … plus `converter:`

### Enums

Enum attributes are supported. The default serialization for enums is a downcased string. Use [`Enum::ValueConverter(T)`](https://crystal-lang.org/api/latest/Enum/ValueConverter.html) to serialize the backing value instead.

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
  attribute size : Size = Size::ExtraMedium, converter: Enum::ValueConverter(Size)
end
```

## Constructing models

```crystal
person = Person.new(name: "Bob Jane", age: 32)
person.attributes # => {:name => "Bob Jane", :age => 32}

# from JSON / YAML
person = Person.from_json(%({"name": "Bob Jane"}))
person.name    # => "Bob Jane"
person.to_json # => {"name":"Bob Jane"}

# from HTTP::Params (also accepts Hash(String, String))
person = Person.new(params)
```

!!! note
    `from_json` / `from_yaml` treat input as untrusted and drop fields that are neither `mass_assign` nor `show`. Use `from_trusted_json` / `from_trusted_yaml` for internal sources. `assign_attributes` updates an existing instance in place.

Introspection helpers: `attributes` (Hash), `attributes_tuple` (NamedTuple), `Person.attributes` (Array of Symbol keys), and `persistent_attributes` (only persisted fields).

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

Per-attribute you get `<attr>_changed?`, `<attr>_was`, `<attr>_change` (a `{old, new}` tuple), and `<attr>_will_change!` to force-mark a field. Across the model: `changed?`, `changed_attributes`, `changed_json` / `changed_yaml`, `restore_attributes` (revert to previous values), and `clear_changes_information` (reset tracking).
