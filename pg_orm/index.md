# PgORM

PgORM is a PostgreSQL ORM for Crystal. It extends [ActiveModel](https://spider-gazelle.net/active_model/index.md) for attribute definitions, callbacks and validations, and adds persistence, associations, a query DSL, pagination and full-text search on top.

Because a model is an `ActiveModel::Model`, everything you already know about `attribute`, validations and `before_*`/`after_*` callbacks applies. This page covers what PgORM adds: connecting to the database, declaring a table-backed model, and persisting it.

## Installation

Add the shard, then require it.

```
dependencies:
  pg-orm:
    github: spider-gazelle/pg-orm
    version: ~> 2.5
```

```
require "pg-orm"
```

## Connection

Configure the database once at boot. The simplest option is to parse a connection URL:

```
PgORM::Database.parse(ENV["PG_DATABASE_URL"])
```

Or set individual values programmatically:

```
PgORM::Database.configure do |settings|
  settings.host = "db.example.com"
  settings.port = 5432
  settings.db = "production"
  settings.user = "app_user"
  settings.password = "secret"
end
```

Every setting also reads from an environment variable by default: `PG_HOST`, `PG_PORT`, `PG_DB` (or `PG_DATABASE`), `PG_USER`, `PG_PASSWORD`, `PG_QUERY` and `PG_LOCK_TIMEOUT` (advisory lock timeout in seconds). The defaults are `localhost`, `5432`, `test`, `postgres`, an empty password and `5`.

Read replicas

Call `PgORM::Database.parse_read(ENV["PG_DATABASE_READ_URL"]?)` to route standalone `SELECT`s (`find`, `where`, `count`, …) to a replica. Writes, and any read inside a `transaction` or `with_connection` block, always hit the primary, so wrap a read in `with_connection` when it must see a write that may not have replicated yet. With no replica URL configured every query uses the primary.

When you configure individual settings rather than calling `parse`, you can instead set `PG_RO_HOST` (and optionally `PG_RO_QUERY`) to point reads at a replica host.

## Declaring a model

Subclass `PgORM::Base` and declare attributes. The table name is inferred from the class name, underscored but not pluralised (`BlogPost` → `blog_post`). The primary key defaults to a column named `id`, which you must declare as an attribute; the model won't compile without it.

```
class User < PgORM::Base
  attribute id : Int64
  attribute name : String
  attribute email : String
  attribute age : Int32 = 0
end
```

### Table name

Override the inferred name with `table`:

```
class User < PgORM::Base
  table "accounts"

  attribute id : Int64
  attribute name : String
end
```

### Primary key

Use `primary_key` to point at a different attribute, or pass several for a composite key:

```
class Token < PgORM::Base
  primary_key :uuid
  attribute uuid : UUID
end

class Membership < PgORM::Base
  primary_key :user_id, :org_id
  attribute user_id : UUID
  attribute org_id : UUID
end
```

To give a hierarchy of models the same primary key, declare it once on an abstract base class with `default_primary_key(name, auto_generated = true, converter = nil)`. It declares the attribute for you:

```
abstract class ApplicationModel < PgORM::Base
  default_primary_key id : Int64
end

class Post < ApplicationModel
  attribute title : String
end
```

### Timestamps

Include `PgORM::Timestamps` to get `created_at` and `updated_at` columns. `created_at` is set on create, `updated_at` on every save; both are UTC.

```
class User < PgORM::Base
  include PgORM::Timestamps

  attribute id : Int64
  attribute name : String
end
```

### Column types

PgORM doesn't create or migrate tables, so create the schema yourself with column types that match your attributes: `String` to `TEXT`, `Int32` to `INTEGER`, `Time` to `TIMESTAMPTZ`, `UUID` to `UUID`, `Array(T)` to an array column, `Set(T)` to an array column, `Enum` to `INTEGER`, and any `JSON::Serializable` (or custom type) to `JSONB`. Make a column nullable by giving the attribute a nilable type (`String?`).

## Persistence

Build an instance and `save`, or `create` in one step. `save` returns `true` or `false`. `create`, `create!` and `save!` raise `PgORM::Error::RecordInvalid` when validation fails (`create` doesn't rescue it), and `create`/`create!` return the record.

```
user = User.new(name: "John", email: "john@example.com")
user.save            # => true / false
user.persisted?      # => true

User.create(name: "Jane", email: "jane@example.com")
User.create!(name: "Alice", email: "alice@example.com")
```

Update by assigning attributes, or with the `update` helpers. Saving a persisted record only writes the columns that actually changed (dirty tracking). Both `update` and `update!` raise `PgORM::Error::RecordInvalid` when validation fails.

```
user.name = "Johnny"
user.save

user.update(email: "johnny@example.com")   # assign + save, => true
user.update!(age: 30)

# skip validations and callbacks, straight UPDATE:
user.update_fields(age: 31)
```

Delete a record with `destroy` (runs callbacks, handles dependent associations, wrapped in a transaction) or `delete` (a bare `DELETE`, no callbacks).

```
user.destroy
user.destroyed?  # => true
user.persisted?  # => false
```

### Finding records

```
User.find(1)                      # raises RecordNotFound if absent
User.find?(1)                     # => User?
User.find_by(email: "j@ex.com")   # raises if absent
User.find_by?(name: "John")       # => User?
User.first                        # raises if the table is empty; first? returns nil
User.last
User.all
```

`find`/`find?` accept a tuple when the model has a composite primary key.

See [Associations](https://spider-gazelle.net/pg_orm/associations/index.md) for `belongs_to`/`has_one`/`has_many`, and [Querying](https://spider-gazelle.net/pg_orm/querying/index.md) for the query DSL, pagination and full-text search.

## See also

- [Associations](https://spider-gazelle.net/pg_orm/associations/index.md)
- [Querying](https://spider-gazelle.net/pg_orm/querying/index.md)
- [ActiveModel](https://spider-gazelle.net/active_model/index.md)
- [Validations](https://spider-gazelle.net/active_model/validations/index.md)
- [Callbacks](https://spider-gazelle.net/active_model/callbacks/index.md)
