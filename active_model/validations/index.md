# Validations

`ActiveModel::Validation` is a mix-in. Include it, then declare rules with the `validates` macro — modelled on [Rails validations](http://guides.rubyonrails.org/active_record_validations.html).

```
require "active-model"

class Person < ActiveModel::Model
  include ActiveModel::Validation

  attribute name : String
  attribute age : Int32

  validates :name, presence: true, length: {minimum: 3}
  validates :age, presence: true, numericality: {greater_than: 5}
end
```

## Checking validity

Call `valid?` to run every rule. It clears `errors`, then checks that every non-nilable persisted field holds a value (adding `"<field> should not be nil"` otherwise). If any are nil it returns `false` straight away without running your rules. Otherwise it runs each validator and returns a `Bool`. `invalid?` is its inverse. `errors` holds an `Array(ActiveModel::Error)`.

```
person = Person.new(name: "JD", age: 10)
person.valid?            # => false
person.errors.first.to_s # => "name is too short"

Person.new(name: "Jane").tap(&.valid?).errors.first.to_s # => "age should not be nil"
```

Note

`Error#to_s` renders as `"<field> <message>"` (e.g. `"name is required"`). Errors on the base — rules with no field — render as `"<ClassName> <message>"`.

## Built-in validators

`validates` accepts one or more fields followed by validator options:

- `presence: true` — value is not nil (and not empty for strings/collections). Add `allow_blank: true` to permit empty.
- `absence: true` — value is nil or empty.
- `numericality: {...}` — `greater_than`, `greater_than_or_equal_to`, `equal_to`, `less_than`, `less_than_or_equal_to`, `other_than`, `odd`, `even`. Add `allow_nil: true` to skip nil values.
- `length: {...}` — `minimum`, `maximum`, `is`, or a range with `in`/`within` (`in: 2..4`). Custom messages via `too_short`, `too_long`, `wrong_length` (used by `in` and `is`). Ranges need active-model 4.7.1 or later.
- `format: {with: /regex/}` and/or `{without: /regex/}` — with an optional `message:`.
- `inclusion: {in: [...]}` / `exclusion: {in: [...]}` (`within:` is an alias), each with an optional `message:`.
- `confirmation: true` — requires a matching `<field>_confirmation` value (a non-persisted attribute is generated for you). Pass `{case_sensitive: false}` to compare case-insensitively. A nil confirmation passes, so add `validates :<field>_confirmation, presence: true` if it must be supplied.

```
validates :email, presence: true, format: {with: /@/, message: "must contain @"}
validates :role, inclusion: {in: %w(admin user guest)}
validates :password, confirmation: true
validates :nickname, length: {maximum: 20}, allow_blank: true
validates :pin, length: {in: 4..6, wrong_length: "must be 4 to 6 digits"}
```

### Conditional rules

`validates` accepts `if:` / `unless:` — a symbol naming a method, or a `Proc` receiving the instance. Both can be combined.

```
validates :card_number, presence: true, if: :paid?
```

## Custom validation

Use the `validate` macro for arbitrary logic. The proc receives the instance and returns a `Bool`; when it returns false the message is recorded against the given field.

```
validate :name, "must not be reserved", ->(this : Person) {
  this.name != "root"
}
```

Given only a message and a proc, the error is attached to the base rather than a field, and `to_s` renders the class name instead (`"Person must not be reserved"`). Every form accepts `if:` / `unless:` keywords, like `validates` (on the field form, this needs active-model 4.7.1 or later):

```
validate :name, "must not be reserved", ->(this : Person) { this.name != "root" }, unless: :admin?
```

Given only a proc, its return value is ignored. Add errors yourself with `validation_error(field, message)`:

```
validate ->(this : Person) {
  age = this.age
  this.validation_error(:age, "must be even") if age && age.odd?
}
```

## See also

- [Active Model](https://spider-gazelle.net/active_model/index.md)
- [Callbacks](https://spider-gazelle.net/active_model/callbacks/index.md)
- [Serialisation](https://spider-gazelle.net/active_model/serialization/index.md)
- [PgORM](https://spider-gazelle.net/pg_orm/index.md)
