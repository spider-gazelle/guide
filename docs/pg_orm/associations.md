# Associations

Associations wire models together with `belongs_to`, `has_one` and `has_many`. Each macro generates accessor methods and hooks the relationship into the save/destroy lifecycle.

```crystal
class Parent < PgORM::Base
  attribute id : Int64
  attribute name : String
  has_many :children, class_name: Child
end

class Child < PgORM::Base
  attribute id : Int64
  attribute age : Int32
  attribute parent_id : Int64?
  belongs_to :parent
end
```

!!! note
    The foreign key lives on the child table, and the macros don't declare it for you: the child model must declare it as an attribute (`parent_id` above).

All three macros accept the same overrides: `class_name`, `foreign_key`, `autosave` and `dependent`. `has_many` also accepts `serialize`. The class is inferred by camelcasing the name (`has_many` first strips a trailing `s`, so `:children` would become `Children`, which is why the example passes `class_name`). `belongs_to` infers the foreign key from the association name (`parent_id`); `has_one` and `has_many` infer it from the declaring class (`Parent` → `parent_id`).

## belongs_to

The child owns the foreign key. `belongs_to :parent` generates, on `Child`:

- `parent` / `parent?` — returns the associated record (`?` returns nil instead of raising);
- `parent=(record)` — assigns it and sets `parent_id` (if `record` isn't saved yet, the key is set when the child is saved);
- `build_parent(**attrs)` — builds an unsaved associated record;
- `create_parent(**attrs)` / `create_parent!(**attrs)` — builds and saves it (both raise `PgORM::Error::RecordInvalid` when validation fails);
- `reload_parent` — force a reload from the database.

```crystal
child = Child.new(age: 6)
child.build_parent(name: "Phil")   # unsaved; saved along with the child
child.parent = existing_parent     # or assign a saved record: sets child.parent_id
child.save
```

The foreign key defaults to `<name>_id` and the class to the camelcased name; override with `foreign_key:` / `class_name:`.

## has_one

Declares a one-to-one where the *other* table holds the foreign key. `has_one :supplier` on `Account` generates `supplier`, `supplier=`, `build_supplier`, `create_supplier`, `create_supplier!` and `reload_supplier`. When the account is persisted, assigning through `supplier=` sets the foreign key on the new record and saves it, applying the `dependent` behaviour to the record it replaces (nullifying its foreign key when `dependent` isn't set). `create_supplier` and `create_supplier!` raise `PgORM::Error::RecordNotSaved` if the account has no id yet.

```crystal
account.create_supplier!(name: "ACME")
account.supplier   # => #<Supplier account_id: 1>
```

## has_many

Declares a one-to-many. `has_many :children` on `Parent` generates a single method, `children`, returning a lazy `PgORM::Relation`. The relation is a full query scope — chain any query method onto it — and it can build and create children pre-wired to the parent:

```crystal
parent = Parent.create!(name: "Phil")

parent.children.create(age: 6)      # INSERT with parent_id set
parent.children.build(age: 3)       # unsaved, parent_id set
parent.children.where_gt(:age, 5).to_a  # queries the database
parent.children.to_a.size               # => 2, includes the unsaved built child
```

Once loaded (or after `build`/`create`), the relation caches its records, so `to_a` returns that cache, including unsaved built records, until you call `reload`. Chaining a query method such as `where_gt` runs a fresh query.

Pass `serialize: true` to include the loaded children in the parent's `to_json` output.

## Generated method summary

| Macro | Reader | Builders | Reload |
| --- | --- | --- | --- |
| `belongs_to` | `name` / `name?` | `build_name`, `create_name`, `create_name!` | `reload_name` |
| `has_one` | `name` / `name?` | `build_name`, `create_name`, `create_name!` | `reload_name` |
| `has_many` | `name` → `Relation` | `name.build`, `name.create` | — |

## Dependency handling

`dependent:` decides what happens to associated records when the owner is destroyed. It is honoured by `destroy` (which wraps the work in a transaction), not by the callback-free `delete`.

| Option | Macros | Effect |
| --- | --- | --- |
| `nil` (default) | all | do nothing |
| `:nullify` | `has_one`, `has_many` | set the foreign key to `NULL` in SQL |
| `:delete` | `belongs_to`, `has_one` | delete the associated row in SQL, no callbacks |
| `:delete_all` | `has_many` | delete the associated rows in SQL, no callbacks |
| `:destroy` | all | call `#destroy` on each associated record, running its callbacks |

!!! warning
    Any other value is silently ignored. In particular, `has_many` only understands `:delete_all`, not `:delete`. On a `belongs_to`, `:delete` and `:destroy` remove the *parent* record.

```crystal
class Parent < PgORM::Base
  attribute id : Int64
  has_many :children, class_name: Child, dependent: :destroy
end

class Child < PgORM::Base
  attribute id : Int64
  attribute parent_id : Int64?
  belongs_to :parent
  has_many :pets, dependent: :delete_all
end
```

## Autosave

`autosave:` controls whether associated records are saved together with the owner:

- `nil` (default) — save only newly *built* associations when the owner is saved;
- `true` — always save the association, new or persisted;
- `false` — never save it automatically.

For `has_many`, only records already held in the relation's cache (loaded, or added with `build`) are saved.

## Lazy loading and joins

Associations lazy-load: the associated record or relation is not fetched until you access it. When you drive the query through a `join`, PgORM caches the joined rows so that accessing the matching `has_many` association uses the cache instead of a second query. `belongs_to` and `has_one` don't use this cache.

```crystal
Parent.where(id: parent.id).join(:left, Child, :parent_id).to_a.first
```

See [Querying](querying.md) for joins in full.

## See also

- [PgORM](README.md)
- [Querying](querying.md)
- [Callbacks](../active_model/callbacks.md)
