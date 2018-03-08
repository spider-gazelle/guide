# Validations

Here's an example of a very simple validation:

```crystal
class Person < ActiveModel::Model
  attribute name : String
  validates :name, presence: true
end

Person.new(name: "John Doe").valid? # => true
Person.new(name: nil).valid? # => false

```

As you can see, our validation lets us know that our `Person` is not valid without a name attribute. The second `Person` is not valid.

Before we dig into more details, let's talk about how validations fit into the big picture of your application.


## Why use validations?

Validations are used to ensure that only valid data is saved into your
database. For example, it may be important to your application to ensure that
every user provides a valid email address and mailing address. Model-level
validations are the best way to ensure that only valid data is saved into your
database. They are database agnostic, cannot be bypassed by end users, and are
convenient to test and maintain. Spider-Gazelle makes them easy to use, provides
built-in helpers for common needs, and allows you to create your own validation
methods as well.

There are several other ways to validate data before it is saved into your
database, including native database constraints, client-side validations and
controller-level validations. Here's a summary of the pros and cons:

* Database constraints and/or stored procedures make the validation mechanisms
  database-dependent and can make testing and maintenance more difficult.
  However, if your database is used by other applications, it may be a good
  idea to use some constraints at the database level. Additionally,
  database-level validations can safely handle some things (such as uniqueness
  in heavily-used tables) that can be difficult to implement otherwise.
* Client-side validations can be useful, but are generally unreliable if used
  alone. If they are implemented using JavaScript, they may be bypassed if
  JavaScript is turned off in the user's browser. However, if combined with
  other techniques, client-side validation can be a convenient way to provide
  users with immediate feedback as they use your site.
* Controller-level validations can be tempting to use, but often become
  unwieldy and difficult to test and maintain. Whenever possible, it's a good
  idea to keep your controllers skinny, as it will make your application a
  pleasure to work with in the long run.

Choose these in certain, specific cases. It's the opinion of the Spider-Gazelle team
that model-level validations are the most appropriate in most circumstances.


## valid? and invalid?

`valid?` triggers your validations
and returns true if no errors were found in the object, and false otherwise.
As you saw above:

```crystal
class Person < ActiveModel::Model
  attribute name : String
  validates :name, presence: true
end

Person.new(name: "John Doe").valid? # => true
Person.new(name: nil).valid? # => false

```

After Active Model has performed validations, any errors found can be accessed
through the `errors` instance method, which returns a collection of errors.
By definition, an object is valid if this collection is empty after running
validations.

Note that an object instantiated with `new` will not report errors
even if it's technically invalid, because validations are run only
when `.valid?` is called.

```crystal
class Person < ActiveModel::Model
  attribute name : String
  validates :name, presence: true
end

p = Person.new
p.errors.empty? # => true : Bool

p.valid? # => false : Bool
p.errors
# => [#<Error:0x1044ddfd0 @model=#<Person:...> @field=:name @message="is required">] : Array(ActiveModel::Error)
p.errors[0].to_s # => "name is required" : String

```

`invalid?` is simply the inverse of `valid?`. It triggers your validations,
returning true if any errors were found in the object, and false otherwise.


## Validation Helpers

Active Model offers many pre-defined validation helpers that you can use
directly inside your class definitions. These helpers provide common validation
rules. Every time a validation fails, an error message is added to the object's
`errors` collection, and this message is associated with the attribute being
validated.

Each helper accepts an arbitrary number of attribute names, so with a single
line of code you can add the same kind of validation to several attributes.

All of them accept the `:message` option, which defines what message should be
added to the `errors` collection if it fails. There is a default error
message for each one of the validation helpers. These messages are used when
the `:message` option isn't specified. Let's take a look at each one of the
available helpers.


### presence

This helper validates that the specified attributes are not empty. It checks for `nil`
and then uses the `empty?` method to check if the value is a blank string or an empty array etc.

```crystal
class Person < ActiveModel::Model
  attribute login : String

  validates :login, presence: true
end

```

You can override the `empty?` check by allowing blank

```crystal
validates :email, presence: true, allow_blank: true

```

The default error message is _"is required"_.


### absence

This helper validates that the specified attributes are absent. It checks for `nil`
and then uses the `empty?` method to check if the value is a blank string or an empty array etc.

The default error message is _"is present"_.


### numericality

This helper validates your attributes numeric values.
Crystals type system will ensure they are the correct type.

```crystal
class Player < ActiveModel::Model
  attribute age : Int32
  validates :age, numericality: { greater_than: 3 }
end

```

* `:greater_than` - Specifies the value must be greater than the supplied
  value. The default error message for this option is _"must be greater than
  %{count}"_.
* `:greater_than_or_equal_to` - Specifies the value must be greater than or
  equal to the supplied value. The default error message for this option is
  _"must be greater than or equal to %{count}"_.
* `:equal_to` - Specifies the value must be equal to the supplied value. The
  default error message for this option is _"must be equal to %{count}"_.
* `:less_than` - Specifies the value must be less than the supplied value. The
  default error message for this option is _"must be less than %{count}"_.
* `:less_than_or_equal_to` - Specifies the value must be less than or equal to
  the supplied value. The default error message for this option is _"must be
  less than or equal to %{count}"_.
* `:other_than` - Specifies the value must be other than the supplied value.
  The default error message for this option is _"must be other than %{count}"_.
* `:odd` - Specifies the value must be an odd number if set to true. The
  default error message for this option is _"must be odd"_.
* `:even` - Specifies the value must be an even number if set to true. The
  default error message for this option is _"must be even"_.

NOTE: By default, `numericality` doesn't allow `nil` values. You can use `allow_nil: true` option to permit it.


### confirmation

You should use this helper when you have two text fields that should receive
exactly the same content. For example, you may want to confirm an email address
or a password. This validation creates a virtual attribute whose name is the
name of the field that has to be confirmed with "_confirmation"_ appended.

```crystal
class Person < ActiveModel::Model
  validates :email, confirmation: true
end

```

This check is performed only if `email_confirmation` is not `nil`. To require
confirmation, make sure to add a presence check for the confirmation attribute.

```crystal
class Person < ActiveModel::Model
  validates :email, confirmation: true
  validates :email_confirmation, presence: true
end

```

There is also a `:case_sensitive` option that you can use to define whether the
confirmation constraint will be case sensitive or not. This option defaults to
true.

```crystal
class Person < ActiveModel::Model
  validates :email, confirmation: { case_sensitive: false }
end

```

The default error message for this helper is _"doesn't match confirmation"_.


### format

This helper validates the attributes' values by testing whether they match a
given regular expression, which is specified using the `:with` option.

```crystal
class Product < ActiveModel::Model
  validates :legacy_code, format: { with: /\A[a-zA-Z]+\z/,
    message: "only allows letters" }
end

```

Alternatively, you can require that the specified attribute does _not_ match the regular expression by using the `:without` option.

The default error message is _"is invalid"_.


### inclusion

This helper validates that the attributes' values are included in a given set.
In fact, this set can be any enumerable object.

```crystal
class Coffee < ActiveModel::Model
  validates :size, inclusion: { in: %w(small medium large),
    message: "is not a valid size" }
end

```

The `inclusion` helper has an option `:in` that receives the set of values that
will be accepted. The `:in` option has an alias called `:within` that you can
use for the same purpose, if you'd like to.

The default error message for this helper is _"is not included in the list"_.


### exclusion

This helper validates that the attributes' values are not included in a given
set. In fact, this set can be any enumerable object.

```crystal
class Account < ActiveModel::Model
  validates :subdomain, exclusion: { in: %w(www us ca jp) }
end

```

The `exclusion` helper has an option `:in` that receives the set of values that
will not be accepted for the validated attributes. The `:in` option has an
alias called `:within` that you can use for the same purpose, if you'd like to.

The default error message is _"is reserved"_.


### length

This helper validates the length of the attributes' values. It provides a
variety of options, so you can specify length constraints in different ways:

```crystal
class Person < ActiveModel::Model
  validates :name, length: { minimum: 2 }
  validates :bio, length: { maximum: 500 }
  validates :password, length: { in: 6..20 }
  validates :registration_number, length: { is: 6 }
end

```

The possible length constraint options are:

* `:minimum` - The attribute cannot have less than the specified length.
* `:maximum` - The attribute cannot have more than the specified length.
* `:in` (or `:within`) - The attribute length must be included in a given
  interval. The value for this option must be a range.
* `:is` - The attribute length must be equal to the given value.

The default error messages depend on the type of length validation being
performed. You can personalize these messages using the `:wrong_length`,
`:too_long`, and `:too_short` options.

```crystal
class Person < ActiveModel::Model
  validates :bio, length: { maximum: 1000,
    too_long: "1000 characters is the maximum allowed" }
end

```


## Conditional validation

Sometimes it will make sense to validate an object only when a given predicate
is satisfied. You can do that by using the `:if` and `:unless` options, which
can take a symbol, a `Proc` or an `Array`. You may use the `:if`
option when you want to specify when the validation **should** happen. If you
want to specify when the validation **should not** happen, then you may use the
`:unless` option.

### Using a Symbol with `:if` and `:unless`

You can associate the `:if` and `:unless` options with a symbol corresponding
to the name of a method that will get called right before validation happens.
This is the most commonly used option.

```crystal
class Order < ActiveModel::Model
  validates :card_number, presence: true, if: :paid_with_card?

  def paid_with_card?
    payment_type == "card"
  end
end

```

### Using a Proc with `:if` and `:unless`

Finally, it's possible to associate `:if` and `:unless` with a `Proc` object
which will be called. Using a `Proc` object gives you the ability to write an
inline condition instead of a separate method. This option is best suited for
one-liners.

```crystal
class Account < ActiveModel::Model
  validates :password, confirmation: true,
    unless: Proc.new(Account) { |a| a.password.blank? }
end

```
