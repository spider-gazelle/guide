`ActiveModel::Validation` is a mix-in. Include it, then declare rules with the `validates` macro — modelled on [Rails validations](http://guides.rubyonrails.org/active_record_validations.html).

```crystal
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

Call `valid?` to run every rule. It clears `errors`, first checks nilability of non-nilable persisted fields, then runs each validator, and returns a `Bool`. `invalid?` is its inverse. `errors` holds an `Array(ActiveModel::Error)`.

```crystal
person = Person.new(name: "JD")
person.valid?          # => false
person.errors.first.to_s # => "name is too short"
```

!!! note
    `Error#to_s` renders as `"<field> <message>"` (e.g. `"name is required"`). Errors on the base — rules with no field — render as `"<ClassName> <message>"`.

## Built-in validators

`validates` accepts one or more fields followed by validator options:

* `presence: true` — value is not nil (and not empty for strings/collections). Add `allow_blank: true` to permit empty.
* `absence: true` — value is nil or empty.
* `numericality: {...}` — `greater_than`, `greater_than_or_equal_to`, `equal_to`, `less_than`, `less_than_or_equal_to`, `other_than`, `odd`, `even`. Add `allow_nil: true` to skip nil values.
* `length: {...}` — `minimum`, `maximum`, `is`, `in`/`within` (a range). Custom messages via `too_short`, `too_long`, `wrong_length`.
* `format: {with: /regex/}` and/or `{without: /regex/}` — with an optional `message:`.
* `inclusion: {in: [...]}` / `exclusion: {in: [...]}` (`within:` is an alias), each with an optional `message:`.
* `confirmation: true` — requires a matching `<field>_confirmation` value (a non-persisted attribute is generated for you). Pass `{case_sensitive: false}` to compare case-insensitively.

```crystal
validates :email, presence: true, format: {with: /@/, message: "must contain @"}
validates :role, inclusion: {in: %w(admin user guest)}
validates :password, confirmation: true
validates :nickname, length: {maximum: 20}, allow_blank: true
```

### Conditional rules

Every validator accepts `if:` / `unless:` — a symbol naming a method, or a `Proc` receiving the instance.

```crystal
validates :card_number, presence: true, if: :paid?
```

## Custom validation

Use the `validate` macro for arbitrary logic. The block receives the instance and returns a `Bool`; when it returns false the message is recorded against the given field.

```crystal
validate :name, "must not be reserved", ->(this : Person) {
  this.name != "root"
}
```

Given only a message and a block, the error is attached to the base rather than a field. You can also push errors directly inside a method with `validation_error(field, message)`.
