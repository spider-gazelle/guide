# Model basics

Spider-Gazelle model is a library containing modules and methods that can be used to
build database object-relational mappings.

It can also be used to validate and coerce values being passed to controllers.


## Attribute Methods

Attribute methods are used to define attributes of the model.


```crystal
class Person < ActiveModel::Model
   attribute name : String

   # You can provide default values
   attribute age : Int32 = 0

   # Converters can be used with JSON.mapping and YAML.mapping to marshal objects
   # see: https://crystal-lang.org/api/latest/Time/EpochConverter.html
   attribute birthday : Time, converter: Time::EpochConverter

   # Sensitive attributes can opt out of mass assignments
   attribute admin : Bool = false, mass_assignment: false
end

person = Person.new
person.name = "Steve"
person.age = 32

person2 = Person.from_json(%({"birthday": 1459859781, "name": "Angus", "age": 34}))
person2.age # => 34 : Int32
person2.birthday # => 2016-04-05 12:36:21 UTC : Time

person.to_json # => %({"name":"Steve","age":32,"admin":false}) : String

```

Mass assignments are those where the model is initialized with `.from_json` or `.new(params)`


## Dirty

An object becomes dirty when it has gone through one or more changes to its attributes and has not been saved.
It gives the ability to check whether an object has been changed or not. It also has attribute based accessor methods.
Let's consider the following Person class:

```crystal
class Person < ActiveModel::Model
   attribute first_name : String
   attribute last_name : String
   attribute children : Array(String) = [] of String
end

person = Person.new
person.changed? # => false : Bool

person.first_name = "First Name"
person.first_name # => "First Name" : String

# returns true if any of the attributes have unsaved changes.
person.changed? # => true : Bool

# returns a Hash of the attributes that have changed with their current values.
person.changed_attributes # => {:first_name => "First Name"} : Hash

```


### Attribute based accessor methods

Track whether the particular attribute has been changed or not.

```crystal
# attr_name_changed?
person.first_name # => "First Name" : String
person.first_name_changed? # => true : Bool

```

Track the previous value of the attribute.

```crystal
# attr_name_was accessor
person.first_name_was # => nil

```

Track both previous and current value of the changed attribute. Returns a tuple if changed, otherwise returns nil.

```crystal
# attr_name_change
person.first_name_change # => {nil, "First Name"} : Tuple
person.last_name_change # => nil

```

Mutations to existing objects require you to signal that a change is going to occur.

```crystal
# attr_name_will_change!
person.children_will_change!
person.children << "Kate"
person.children_changed? # => true : Bool

```


## Validations

Validations ensure that the values in a model meet certain conditions and requirements.

```crystal
class Person < ActiveModel::Model
   attribute name : String
   attribute age : Int32
   attribute email : String

   validates :name, presence: true, length: {minimum: 3, too_short: "must be 3 characters long"}
   validates :age,  presence: true, numericality: {greater_than: 5}

   validates :email, confirmation: true
   validates :email, format: {
    :with    => /@/,
    :without => /.edu/,
  }
end

person = Person.new
person.valid? # => false : Bool

person.name = "Lisa"
person.age = 4
person.email = "lisa@gmail.com"
person.valid? # => false : Bool
person.person.errors[0].to_s # => "Age must be greater than 5" : String

person.age = 6
person.valid? # => true : Bool

```


## Serialization

Provides basic serialization for your object. For example, consider the following object.

```crystal
class Person < ActiveModel::Model
   attribute name : String
   attribute age : Int32
   attribute password : String, mass_assignment: false
end

```

The `.from_json` method provides a safe way to instantiate the model from an untrusted source such as a POST request.

```crystal
person = Person.from_json(%({"name": "Sarah", "age": 8, "password": "malicious"}))

```

The `.attributes` method returns a Hash of all the objects values

```crystal
# notice the malicious password was not accepted
person.attributes # => {:name => "Sarah", :age => 8, :password => nil} : Hash

```

If the source of the JSON is trusted, such as a document database.

```crystal
# password attribute will be set on the object
person = Person.from_trusted_json(%({"name": "Sarah", "age": 8, "password": "my-pass-hash"}))

```

`.to_json` serializes the model into a JSON string

```crystal
person.to_json # => {"name":"Sarah","age":8,"password":"my-pass-hash"} : String

```

To only serialize a select number of attributes

```crystal
person.attributes.select(:name, :age).to_json # => {"name":"Sarah","age":8} : String

```

